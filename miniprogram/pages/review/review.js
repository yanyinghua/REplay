// pages/review/review.js
const store = require('../../utils/store.js')

Page({
  data: { dueCount: 0 },
  onShow() { this.setData({ dueCount: store.getDueWordIds().length }) },
  start() { wx.redirectTo({ url: '/pages/quiz/quiz?mode=review' }) },
  back() { wx.switchTab({ url: '/pages/home/home' }) }
})
