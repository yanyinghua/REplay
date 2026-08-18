// pages/launch/launch.js
Page({
  onReady() {
    setTimeout(() => {
      wx.switchTab({ url: '/pages/home/home' })
    }, 1200)
  }
})
