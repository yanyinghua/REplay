// pages/login/login.js —— 登录门禁：微信一键登录（openid），无白名单，任何微信用户可进
const auth = require('../../utils/auth.js')

Page({
  data: { loading: false },

  onLoad() {
    // 已登录过：直接进入首页
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/home/home' })
    }
  },

  async onLogin() {
    if (this.data.loading) return
    if (!(wx.cloud && wx.cloud.callFunction)) {
      wx.showModal({
        title: '无法登录',
        content: '当前基础库/环境不支持云开发。请在真机预览或测试版小程序中使用（需绑定云环境）。',
        showCancel: false
      })
      return
    }
    this.setData({ loading: true })
    wx.showLoading({ title: '登录中…', mask: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      const r = (res && res.result) || {}
      if (!r || !r.openid) throw new Error(r.error || '登录失败，请重试')
      auth.markLoggedIn(r.openid)
      wx.hideLoading()
      this.setData({ loading: false })
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 600)
    } catch (e) {
      wx.hideLoading()
      this.setData({ loading: false })
      wx.showModal({
        title: '登录失败',
        content: '请确认当前小程序为测试版/正式版（含云环境），并在真机上重试。\n' + ((e && e.message) || ''),
        showCancel: false
      })
    }
  }
})
