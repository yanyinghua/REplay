// pages/map/map.js
const words = require('../../data/words.js')
const store = require('../../utils/store.js')

Page({
  data: { books: [] },

  onShow() { this.refresh() },

  refresh() {
    const books = words.getBooks().map(b => {
      const levelCount = words.getLevelCount(b.bookId)
      const prog = store.getBookProgress(b.bookId)
      const levels = []
      let passedCount = 0
      for (let i = 0; i < levelCount; i++) {
        const lv = (prog.levels && prog.levels[i]) || { stars: 0, passed: false }
        if (lv.passed) passedCount++
        // 第一关永远解锁；之后需前一关已通关
        const locked = i > 0 && !(prog.levels && prog.levels[i - 1] && prog.levels[i - 1].passed)
        levels.push({ idx: i, stars: lv.stars, passed: lv.passed, locked })
      }
      return Object.assign({}, b, { levelCount, passedCount, levels })
    })
    this.setData({ books })
  },

  openLevel(e) {
    const { book, level } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/study/study?bookId=${book}&level=${level}` })
  }
})
