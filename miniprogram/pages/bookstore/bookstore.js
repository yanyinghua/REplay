// pages/bookstore/bookstore.js —— 词库中心：浏览/下载/删除云端词库
const wordbank = require('../../utils/wordbank.js')

Page({
  data: {
    books: [],
    loading: false
  },

  onShow() { this.refresh() },

  refresh() {
    this.setData({ loading: true })
    wordbank.loadCloudBooks().then(() => {
      const books = wordbank.getBooks().map(b => ({
        bookId: b.bookId,
        name: b.name,
        desc: b.desc || '',
        emoji: b.emoji || '📚',
        source: b.source,
        downloaded: b.downloaded,
        downloading: false,
        wordCount: b.wordCount || 0,
        levelCount: wordbank.getLevelCount(b.bookId)
      }))
      this.setData({ books, loading: false })
    })
  },

  findIndex(id) {
    return this.data.books.findIndex(b => b.bookId === id)
  },

  download(e) {
    const id = e.currentTarget.dataset.id
    const i = this.findIndex(id)
    this.setData({ [`books[${i}].downloading`]: true })
    wordbank.download(id).then(() => {
      wx.showToast({ title: '下载完成', icon: 'success' })
      this.refresh()
    }).catch(err => {
      wx.showToast({ title: '下载失败：' + (err.message || '请检查网络'), icon: 'none' })
      this.refresh()
    })
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    const book = this.data.books.find(b => b.bookId === id)
    wx.showModal({
      title: '删除词库',
      content: `确定删除「${book ? book.name : id}」？学习记录将保留，重新下载可继续。`,
      confirmText: '删除',
      confirmColor: '#f25f5c',
      success: res => {
        if (!res.confirm) return
        wordbank.remove(id)
        wx.showToast({ title: '已删除', icon: 'none' })
        this.refresh()
      }
    })
  },

  openBook(e) {
    const id = e.currentTarget.dataset.id
    wordbank.ensureBook(id).then(() => {
      wx.navigateTo({ url: `/pages/study/study?bookId=${id}&level=0` })
    }).catch(err => {
      wx.showToast({ title: err.message || '打开失败', icon: 'none' })
    })
  }
})
