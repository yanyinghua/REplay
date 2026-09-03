// utils/vip.js —— 免广告 / VIP 会员状态（配合 utils/ads.js 使用）
// 三种「免广告」来源，优先级从高到低：
//   ① VIP 会员   profile.vipUntil（ms 时间戳，云端/未来支付写入，未过期即生效）
//   ② 新人体验   自 profile.createdAt 起 trialDays 天内（远程 ad_config.vip.trialDays，0=关闭）
//   ③ 免广告券   profile.adSkips（首次启用按 skipQuota 赠送；每免一次广告消耗 1 张）
// 任何一类生效时：插屏广告不弹；首页金币入口直发，不调起激励视频。
// 注意：本模块只读/写本地 user_profile 并随现有云同步自动互备。
const store = require('./store.js')
const DAY = 86400000

function get() {
  return store.getProfile() || {
    exp: 0, level: 1, coin: 0, streak: 0, lastCheckin: 0,
    badges: [], createdAt: Date.now()
  }
}
function persist(p) { store.saveProfile(p) }

// 远程配置 vipCfg（ad_config.vip）→ 免广告状态
// 返回 { free:boolean, reason, skipsLeft }；reason: 'vip' | 'trial' | 'skip' | 'off' | ''
// free=true 时附带剩余量供 UI 展示：vipLeft / trialLeft / skipsLeft（单位 ms / ms / 张）
function status(vipCfg) {
  const p = get()
  const now = Date.now()
  const cfg = vipCfg || {}
  if (!cfg.on) return { free: false, reason: 'off', skipsLeft: 0 }

  // 免广告券：开启功能即按 skipQuota 赠送一次（VIP / 体验期内不消耗，仅展示余额）
  const quota = Number(cfg.skipQuota) || 0
  if (quota > 0 && p.adSkips === undefined) {
    p.adSkips = quota
    persist(p)
  }
  const skipsLeft = p.adSkips || 0

  // ① VIP 会员：vipUntil 未过期
  const until = Number(p.vipUntil) || 0
  if (until > now) return { free: true, reason: 'vip', vipLeft: until - now, skipsLeft }

  // ② 新人体验期：createdAt + trialDays 之后失效
  const days = Number(cfg.trialDays) || 0
  if (days > 0) {
    const born = Number(p.createdAt) || now
    const t = born + days * DAY - now
    if (t > 0) return { free: true, reason: 'trial', trialLeft: t, skipsLeft }
  }

  // ③ 免广告券：每免一次广告消耗 1 张（花光后保持 0，不再补）
  if (skipsLeft > 0) return { free: true, reason: 'skip', skipsLeft }
  return { free: false, reason: '', skipsLeft }
}

// 消耗一张免广告券（仅当当前档位为券且余额 > 0），返回是否消耗成功
function spendSkip() {
  const p = get()
  if ((p.adSkips || 0) > 0) {
    p.adSkips -= 1
    persist(p)
    return true
  }
  return false
}

// 供未来会员售卖 / 运营后台赠送调用：写入到期时间戳并自动上云同步
function setVipUntil(ts) {
  const p = get()
  p.vipUntil = Number(ts) || 0
  persist(p)
  return p
}

module.exports = { status, spendSkip, setVipUntil }
