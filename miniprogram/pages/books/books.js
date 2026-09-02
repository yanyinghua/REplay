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
        return Object.assign({ color: '#4f6ef7', emoji: '📚' }, b, {
          total, learned,
          percent: total ? Math.round(learned / total * 100) : 0
        })
      })
    this.setData({ books: list })
  },

  openBook(e) {
    const id = e.currentTarget.dataset.id
    words.ensureBook(id).then(() => {
      // 先进入选词页：勾选不认识的单词，再开始学习
      wx.navigateTo({ url: `/pages/pick/pick?bookId=${id}` })
    }).catch(err => {
      wx.showToast({ title: err.message || '打开失败', icon: 'none' })
    })
  },

  goStore() {
    wx.navigateTo({ url: '/pages/bookstore/bookstore' })
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  goRead() {
    wx.navigateTo({ url: '/pages/library/library' })
  }
})
