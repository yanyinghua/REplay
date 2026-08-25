// pages/review/review.js
const store = require('../../utils/store.js')
const words = require('../../utils/wordbank.js')

Page({
  data: { dueCount: 0, dueWords: [] },
  onShow() {
    const ids = store.getDueWordIds()
    const list = ids.slice(0, 8).map(id => words.getWord(id)).filter(Boolean)
    this.setData({ dueCount: ids.length, dueWords: list })
  },
  start() { wx.redirectTo({ url: '/pages/quiz/quiz?mode=review' }) },
  back() { wx.switchTab({ url: '/pages/home/home' }) }
})
