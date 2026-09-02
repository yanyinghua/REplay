// pages/map/map.js —— 关卡地图（内置 + 已下载的云端词库）
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')

Page({
  data: { books: [], resume: null },

  onShow() {
    this.refresh()
    words.loadCloudBooks().then(() => this.refresh())
  },

  // 「继续学习」：读取上次断点(书+关)，若那关已通关则顺延到下一个未通关且已解锁的关
  buildResume(books) {
    const pos = store.loadLastPos()
    if (!pos) return null
    const book = books.find(b => b.bookId === pos.bookId)
    if (!book) return null
    const prog = store.getBookProgress(pos.bookId)
    const levelCount = book.levelCount || 0
    let target = pos.level
    if (target < 0 || target >= levelCount) return null
    const passed = !!(prog.levels && prog.levels[target] && prog.levels[target].passed)
    if (passed) {
      target = -1
      for (let i = pos.level + 1; i < levelCount; i++) {
        const prevPassed = i === 0 || !!(prog.levels && prog.levels[i - 1] && prog.levels[i - 1].passed)
        const curPassed = !!(prog.levels && prog.levels[i] && prog.levels[i].passed)
        if (prevPassed && !curPassed) { target = i; break }
      }
      if (target < 0) return null // 整本已通关
    }
    return { bookId: pos.bookId, name: book.name, emoji: book.emoji, level: target }
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
    this.setData({ books, resume: this.buildResume(books) })
  },

  openLevel(e) {
    const { book, level } = e.currentTarget.dataset
    words.ensureBook(book).then(() => {
      wx.navigateTo({ url: `/pages/study/study?bookId=${book}&level=${level}` })
    }).catch(err => {
      wx.showToast({ title: err.message || '打开失败', icon: 'none' })
    })
  },

  goResume() {
    const r = this.data.resume
    if (!r) return
    words.ensureBook(r.bookId).then(() => {
      wx.navigateTo({ url: `/pages/study/study?bookId=${r.bookId}&level=${r.level}` })
    }).catch(err => {
      wx.showToast({ title: err.message || '打开失败', icon: 'none' })
    })
  }
})
