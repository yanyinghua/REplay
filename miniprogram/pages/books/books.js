// pages/books/books.js —— 可用词库列表（内置 + 已下载的云端词库）
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')

Page({
  data: { books: [] },

  onShow() {
    this.refresh()
    words.loadCloudBooks().then(() => this.refresh())
  },

  refresh() {
    const list = words.getBooks()
      .filter(b => b.downloaded) // 只显示可用词库（内置 + 已下载云端）
      .map(b => {
        const total = words.getWords(b.bookId).length
        const prog = store.getBookProgress(b.bookId)
        const learned = prog.learned || 0
        return Object.assign({}, b, {
          total, learned,
          percent: total ? Math.round(learned / total * 100) : 0
        })
      })
    this.setData({ books: list })
  },

  openBook(e) {
    const id = e.currentTarget.dataset.id
    words.ensureBook(id).then(() => {
      // 定位到第一个未通关的关卡
      const cnt = words.getLevelCount(id)
      let level = 0
      const prog = store.getBookProgress(id)
      for (let i = 0; i < cnt; i++) {
        if (!(prog.levels && prog.levels[i] && prog.levels[i].passed)) { level = i; break }
        if (i === cnt - 1) level = cnt - 1
      }
      wx.navigateTo({ url: `/pages/study/study?bookId=${id}&level=${level}` })
    }).catch(err => {
      wx.showToast({ title: err.message || '打开失败', icon: 'none' })
    })
  },

  goStore() {
    wx.navigateTo({ url: '/pages/bookstore/bookstore' })
  }
})
