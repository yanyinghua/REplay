// utils/ads.js —— 广告统一封装（流量主）
// 设计：
//   1. 远程开关：云数据库 ad_config 集合，文档 _id = 'main'
//      { rewarded: { on, adUnitId, coin },
//        interstitial: { on, adUnitId, cooldown },   // cooldown：两次广告全局最小间隔（秒，默认 60）
//        banner: { on, adUnitId } }
//   2. 每次拉取结果缓存到 storage，拉取失败回退缓存/内置默认（默认全关，未配置绝不创建广告）
//   3. 业务侧调 showRewarded() 看完整视频领奖励；调 maybeInterstitial('场景') 在自然翻篇点弹插屏。
//      统一处理 加载/展示/onClose(isEnded) 状态机，杜绝「没看完也算奖励」「重复注册监听」等常见坑。
// 频控边界（开发者可控制的只有「什么时候弹」，广告时长与关闭按钮均由微信平台控制）：
//   ① 激励视频必须完整看完才发奖（微信控制时长，一般 15~30s，无法缩短）
//   ② 插屏展示期间/刚冷启动/距上次插屏或激励视频播放太近，平台会直接拦截
//      → 这里做程序级保底：全局冷却 cooldown 秒 + 每日每场景最多 1 次
// 使用前必须：小程序后台 → 流量主 → 创建广告位拿到 adUnitId，写入 ad_config 文档并把 on 打开，
// 之后无需发版，用户端下次进页面自动生效。

const AD_CFG_KEY = 'ad_config_v1'
const CFG_DOC = 'main'
// 最近一次展示任意广告（激励/插屏）的时间戳：作为「全局防打扰冷却」的依据
const LAST_AD_KEY = 'ad_last_show_v1'

function dayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

const vip = require('./vip.js')

const DEFAULTS = {
  rewarded: { on: false, adUnitId: '', coin: 10 },  // coin：完整观看后业务侧给的金币数（默认 10）
  // cooldown 默认 60 秒：微信平台对插屏/激励视频本身有更高频控下限，
  // 设再小也会被平台拦截返回错误码，60s 只是程序侧不让「连点/连弹」的保底。
  interstitial: { on: false, adUnitId: '', cooldown: 60 },
  banner: { on: false, adUnitId: '' },
  // 免广告 / VIP：详见 utils/vip.js。
  //   trialDays     新人注册起 N 天内全程去广告（0=关闭新人体验）
  //   skipQuota     首启赠送 N 张「免广告券」，体验期过后每免一次扣 1 张（0=不送）
  //   rewardDirect  免广告期间首页金币入口直发，不调起激励视频
  vip: { on: false, trialDays: 7, skipQuota: 10, rewardDirect: true }
}

let CACHED = null

function deepMerge(base, ext) {
  const out = Object.assign({}, base)
  Object.keys(ext || {}).forEach(k => {
    if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) &&
        ext[k] && typeof ext[k] === 'object' && !Array.isArray(ext[k])) {
      out[k] = Object.assign({}, out[k], ext[k])
    } else if (ext[k] !== undefined) {
      out[k] = ext[k]
    }
  })
  return out
}

function getConfig() {
  if (CACHED) return CACHED
  let local = null
  try { local = wx.getStorageSync(AD_CFG_KEY) || null } catch (e) {}
  CACHED = deepMerge(DEFAULTS, local || {})
  return CACHED
}

// 拉取远程广告开关（可反复调用；失败时保留旧配置）
function loadConfig() {
  if (!wx.cloud || !wx.cloud.database) return Promise.resolve(getConfig())
  const db = wx.cloud.database()
  return db.collection('ad_config').doc(CFG_DOC).get()
    .then(r => {
      const data = (r && r.data) || {}
      CACHED = deepMerge(DEFAULTS, data)
      try { wx.setStorageSync(AD_CFG_KEY, CACHED) } catch (e) {}
      return CACHED
    })
    .catch(() => getConfig())
}

// 某类广告是否「已开通且填了广告位」
function isOn(kind) {
  const c = getConfig()
  const g = c[kind]
  return !!(g && g.on && g.adUnitId)
}

function adUnitId(kind) {
  const c = getConfig()
  const g = c[kind]
  return (g && g.adUnitId) || ''
}

// 激励视频的奖励金币数（业务侧展示/发放用）
function rewardCoin() {
  const c = getConfig()
  return Number((c.rewarded && c.rewarded.coin)) || DEFAULTS.rewarded.coin
}

// 展示激励视频，返回 Promise：
//   { ok: true }                            → 完整看完，可发奖励
//   { ok: false, code, msg }                → 未完成/失败，不发奖励
//   业务侧必须「收到 ok:true 再发奖」，防止用户中途关闭刷奖励
function showRewarded() {
  const cfg = getConfig()
  if (!cfg.rewarded || !cfg.rewarded.on || !cfg.rewarded.adUnitId) {
    return Promise.resolve({ ok: false, code: 'ad_off', msg: '广告暂未开放' })
  }
  if (typeof wx.createRewardedVideoAd !== 'function') {
    return Promise.resolve({ ok: false, code: 'unsupported', msg: '当前环境不支持激励视频' })
  }

  const ad = wx.createRewardedVideoAd({ adUnitId: cfg.rewarded.adUnitId })
  let settled = false

  return new Promise(resolve => {
    const done = payload => {
      if (settled) return
      settled = true
      try { if (ad.destroy) ad.destroy() } catch (e) {}
      resolve(payload)
    }
    ad.onError(() => done({ ok: false, code: 'ad_error', msg: '广告加载失败，请稍后再试' }))
    ad.onClose(res => {
      // 真机看完 isEnded === true；提前关闭返回 false
      const ended = !!(res && res.isEnded)
      done(ended
        ? { ok: true }
        : { ok: false, code: 'not_finish', msg: '看完视频才能领取奖励哦' })
    })
    // 首次 show 通常需要先 load；已加载过则直接 show
    ad.show().then(() => markLastAd()).catch(() => ad.load().then(() => ad.show()).then(() => markLastAd())
      .catch(() => done({ ok: false, code: 'load_fail', msg: '暂无广告，请稍后再试' })))
  })
}

// ---------- 全局防打扰冷却 ----------
function markLastAd() {
  try { wx.setStorageSync(LAST_AD_KEY, Date.now()) } catch (e) {}
}

// 展示插屏广告（低频、非打扰式），scene 为场景标识：
// 调用方只在「自然翻篇点」调用（如一次闯关/一轮复习结束），且内置三重保护，任一不满足即静默跳过：
//   ① 后台未开通 / 未填广告位（ad_config.interstitial.on && adUnitId）
//   ② 距上次任意广告（激励视频/插屏）展示不足 cooldown 秒（默认 60，低于平台频控下限也会被拦）
//   ③ 同一场景当天已展示过（每日每场景至多 1 次）
// 返回 Promise<{ ok, code, msg }>：ok:true 表示已成功展示；其余情况调用方不应有任何动作/toast。
function maybeInterstitial(scene) {
  const cfg = getConfig()
  const g = cfg.interstitial
  if (!g || !g.on || !g.adUnitId) {
    return Promise.resolve({ ok: false, code: 'ad_off' })
  }
  if (typeof wx.createInterstitialAd !== 'function') {
    return Promise.resolve({ ok: false, code: 'unsupported', msg: '当前环境不支持插屏广告' })
  }
  const cd = Number(g.cooldown) || 60
  let last = 0
  try { last = Number(wx.getStorageSync(LAST_AD_KEY)) || 0 } catch (e) {}
  if (Date.now() - last < cd * 1000) {
    return Promise.resolve({ ok: false, code: 'cooldown' })
  }
  const k = 'ad_inter_' + String(scene || 'default') + '_' + dayStr()
  try { if (wx.getStorageSync(k)) return Promise.resolve({ ok: false, code: 'daily_done' }) } catch (e) {}
  // 免广告挡板（VIP 会员 / 新人体验期 / 免广告券）：走到这说明本应弹插屏，
  // 免广告生效则跳过，不打断学习。券档位在这里消耗 1 张。
  const v = vip.status(cfg.vip)
  if (v.free) {
    if (v.reason === 'skip') vip.spendSkip()
    return Promise.resolve({ ok: false, code: 'ad_free', reason: v.reason })
  }
  const ad = wx.createInterstitialAd({ adUnitId: g.adUnitId })
  let settled = false
  const afterShow = () => {
    try {
      wx.setStorageSync(LAST_AD_KEY, Date.now())
      wx.setStorageSync(k, 1)
    } catch (e) {}
  }
  return new Promise(resolve => {
    const done = payload => {
      if (settled) return
      settled = true
      try { if (ad.destroy) ad.destroy() } catch (e) {}
      resolve(payload)
    }
    ad.onError(() => done({ ok: false, code: 'ad_error', msg: '广告加载失败，请稍后再试' }))
    ad.onClose(() => done({ ok: true }))
    ad.show().then(() => { afterShow(); done({ ok: true }) }).catch(() =>
      ad.load().then(() => ad.show()).then(() => { afterShow(); done({ ok: true }) })
        .catch(() => done({ ok: false, code: 'load_fail', msg: '暂无广告，请稍后再试' })))
  })
}

// ---------- 免广告/VIP 状态查询（供业务侧 UI 展示与金币直发判断） ----------
// 当前免广告状态：{ free, reason, ... }，reason: 'vip'|'trial'|'skip'|'off'|''
function vipStatus() {
  return vip.status(getConfig().vip)
}

// 金币入口能否「免看视频直发」：免广告生效 且 远程配置 rewardDirect 打开
function vipCanDirect() {
  const cfg = getConfig()
  const v = vip.status(cfg.vip)
  if (!v.free) return { free: false }
  if (!cfg.vip || !cfg.vip.rewardDirect) return { free: false }
  return v
}

// 消耗一张免广告券（仅券档位调用；内部自带余额校验）
function vipSpend() {
  return vip.spendSkip()
}

module.exports = {
  DEFAULTS,
  getConfig,
  loadConfig,
  isOn,
  adUnitId,
  rewardCoin,
  showRewarded,
  maybeInterstitial,
  vipStatus,
  vipCanDirect,
  vipSpend
}
