// pages/launch/launch.js —— 启动闪屏：已登录 → 首页；未登录 → 登录门禁
const auth = require('../../utils/auth.js')

Page({
  onReady() {
    const logged = auth.isLoggedIn()
    setTimeout(() => {
      if (logged) {
        wx.switchTab({ url: '/pages/home/home' })
      } else {
        wx.redirectTo({ url: '/pages/login/login' })
      }
    }, logged ? 600 : 900)
  }
})
