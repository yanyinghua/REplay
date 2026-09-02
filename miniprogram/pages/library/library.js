// pages/library/library.js —— 双语书库：浏览 / 下载 / 自动更新名著
const novels = require('../../utils/novels.js')

Page({
  data: {
    books: [],
    loading: false,
    autoUpdate: true,
    checking: false
  },

  onShow() {
    this.setData({ autoUpdate: novels.getAutoUpdate() })
    this.refresh()
    // 拉取云端书目（新书/更新会在此出现）
    novels.loadCloudNovels().then(() => {
      this.refresh()
      this.checkUpdates()
    })
  },

  refresh() {
    this.setData({ books: novels.getBooks() })
  },

  // 自动更新：检测到已下载书目有新版本 → 静默下载新版
  checkUpdates() {
    if (this.data.checking) return
    this.setData({ checking: true })
    novels.autoUpdate((c, done, total) => {
      wx.showLoading({ title: `更新中 ${done}/${total}`, mask: true })
    }).then(updated => {
      wx.hideLoading()
      this.setData({ checking: false })
      this.refresh()
      if (updated > 0) wx.showToast({ title: `${updated} 本书已自动更新`, icon: 'none' })
    })
  },

  onAutoChange(e) {
    const on = e.detail.value
    novels.setAutoUpdate(on)
    this.setData({ autoUpdate: on })
    if (on) this.checkUpdates()
  },

  // 手动检查更新（无论是否开启自动）
  manualCheck() {
    if (this.data.checking) return
    this.setData({ checking: true })
    wx.showLoading({ title: '检查更新中…', mask: true })
    novels.loadCloudNovels().then(() => {
      wx.hideLoading()
      this.setData({ checking: false })
      this.refresh()
      wx.showToast({ title: '书目已刷新', icon: 'none' })
      this.checkUpdates()
    })
  },

  open(e) {
    const id = e.currentTarget.dataset.id
    const book = this.data.books.find(b => b.novelId === id)
    if (!book) return
    if (book.needUpdate) {
      wx.showToast({ title: '发现新版，请先更新', icon: 'none' })
      this.doDownload(book)
      return
    }
    if (book.source === 'cloud' && !book.downloaded && !book.readable) {
      this.doDownload(book)
      return
    }
    wx.navigateTo({ url: `/pages/read/read?novelId=${id}` })
  },

  download(e) {
    const id = e.currentTarget.dataset.id
    const book = this.data.books.find(b => b.novelId === id)
    if (book) this.doDownload(book)
  },

  doDownload(book) {
    wx.showLoading({ title: '正在下载…', mask: true })
    novels.download(book.novelId).then(() => {
      wx.hideLoading()
      wx.showToast({ title: '《' + book.title + '》已就绪', icon: 'success' })
      this.refresh()
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '下载失败：' + (err.message || '请检查网络'), icon: 'none' })
    })
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    const book = this.data.books.find(b => b.novelId === id)
    wx.showModal({
      title: '删除下载',
      content: `删除《${book ? book.title : id}》的本地内容？阅读进度将保留。`,
      confirmText: '删除',
      confirmColor: '#f25f5c',
      success: res => {
        if (!res.confirm) return
        novels.remove(id)
        wx.showToast({ title: '已删除', icon: 'none' })
        this.refresh()
      }
    })
  }
})
