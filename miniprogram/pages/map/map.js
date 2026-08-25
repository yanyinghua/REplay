// pages/map/map.js —— 关卡地图（内置 + 已下载的云端词库）
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')

Page({
  data: { books: [] },

  onShow() {
    this.refresh()
    words.loadCloudBooks().then(() => this.refresh())
  },

  refresh() {
    const books = words.getBooks()
      .filter(b => b.downloaded) // 只显示可用词库
      .map(b => {
        const levelCount = words.getLevelCount(b.bookId)
        const prog = store.getBookProgress(b.bookId)
        const levels = []
        let passedCount = 0
        for (let i = 0; i < levelCount; i++) {
          const lv = (prog.levels && prog.levels[i]) || { stars: 0, passed: false }
          if (lv.passed) passedCount++
          // 第一关永远解锁；之后需前一关已通关
          const locked = i > 0 && !(prog.levels && prog.levels[i - 1] && prog.levels[i - 1].passed)
          let starStr
          if (lv.stars > 0) {
            starStr = ''
            for (let s = 0; s < lv.stars; s++) starStr += '⭐'
          } else if (lv.locked) {
            starStr = '🔒'
          } else {
            starStr = '·'
          }
          levels.push({ idx: i, stars: lv.stars, passed: lv.passed, locked, starStr })
        }
        return Object.assign({}, b, { levelCount, passedCount, levels })
      })
    this.setData({ books })
  },

  openLevel(e) {
    const { book, level } = e.currentTarget.dataset
    words.ensureBook(book).then(() => {
      wx.navigateTo({ url: `/pages/study/study?bookId=${book}&level=${level}` })
    }).catch(err => {
      wx.showToast({ title: err.message || '打开失败', icon: 'none' })
    })
  }
})
