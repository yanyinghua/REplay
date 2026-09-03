// utils/ads.js —— 广告统一封装（流量主）
// 设计：
//   1. 远程开关：云数据库 ad_config 集合，文档 _id = 'main'
//      { rewarded: { on, adUnitId, coin }, interstitial: { on, adUnitId }, banner: { on, adUnitId } }
//   2. 每次拉取结果缓存到 storage，拉取失败回退缓存/内置默认（默认全关，未配置绝不创建广告）
//   3. 业务侧只调 showRewarded()，统一处理 加载/展示/onClose(isEnded) 状态机，
//      杜绝「没看完也算奖励」「重复注册监听」等常见坑。
// 使用前必须：小程序后台 → 流量主 → 创建广告位拿到 adUnitId，写入 ad_config 文档并把 on 打开，
// 之后无需发版，用户端下次进页面自动生效。

const AD_CFG_KEY = 'ad_config_v1'
const CFG_DOC = 'main'

const DEFAULTS = {
  rewarded: { on: false, adUnitId: '', coin: 10 },  // coin：完整观看后业务侧给的金币数（默认 10）
  interstitial: { on: false, adUnitId: '' },
  banner: { on: false, adUnitId: '' }
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
    ad.show().catch(() => ad.load().then(() => ad.show())
      .catch(() => done({ ok: false, code: 'load_fail', msg: '暂无广告，请稍后再试' })))
  })
}

module.exports = {
  DEFAULTS,
  getConfig,
  loadConfig,
  isOn,
  adUnitId,
  rewardCoin,
  showRewarded
}
