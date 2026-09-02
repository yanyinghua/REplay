// app.js
const sync = require('./utils/sync.js')

App({
  globalData: {
    openid: null,
    profile: null
  },

  onLaunch() {
    // 云开发初始化：请替换 env 为你的云开发环境 ID
    // 注意：游客 appid(touristappid) 下云能力不可用，需填入真实 appid 与 env
    if (!wx.cloud) {
      console.error('当前基础库不支持云开发，请使用 2.2.3 或以上的基础库')
      sync.disable()
    } else {
      wx.cloud.init({
        env: 'cloudbase-d3gcgv15j8708be61',
        traceUser: true
      })
      // 学习存档云同步：新设备整包恢复；已有本地数据则增量合并（双设备/重装不丢）
      sync.init()
    }

    // M1 阶段：本地存储兜底，保证不部署云函数也能跑通玩法
    if (!wx.getStorageSync('srs_state')) wx.setStorageSync('srs_state', {})
    if (!wx.getStorageSync('user_profile')) {
      wx.setStorageSync('user_profile', {
        exp: 0, level: 1, coin: 0, streak: 0,
        lastCheckin: 0, badges: [], createdAt: Date.now()
      })
    }
    if (!wx.getStorageSync('book_progress')) wx.setStorageSync('book_progress', {})
  },

  // 切后台/退出时立即把待同步数据推上云（防抖定时器可能来不及触发）
  onHide() {
    sync.flush()
  }
})
