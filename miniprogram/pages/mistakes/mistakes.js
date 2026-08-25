// pages/mistakes/mistakes.js —— 错词本（聚焦易错词，巩固直到清零）
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')
const srs = require('../../utils/srs.js')

Page({
  data: { list: [], count: 0, totalWrong: 0 },

  onShow() { this.refresh() },

  refresh() {
    const ids = store.getWrongWordIds()
    const list = ids.map(id => {
      const w = words.getWord(id)
      if (!w) return null
      const rec = store.getRecord(id)
      return {
        id, emoji: w.emoji, spell: w.spell,
        meaning: w.meaning, phonetic: w.phonetic,
        lapses: rec.lapses || 0,
        next: srs.nextIntervalText(rec)
      }
    }).filter(Boolean).sort((a, b) => b.lapses - a.lapses) // 错得最多的排前面
    const totalWrong = list.reduce((s, x) => s + x.lapses, 0)
    this.setData({ list, count: list.length, totalWrong })
  },

  practice() {
    if (this.data.count === 0) { wx.showToast({ title: '没有错词', icon: 'none' }); return }
    wx.navigateTo({ url: '/pages/quiz/quiz?mode=wrong' })
  },

  remove(e) {
    store.removeFromWrong(e.currentTarget.dataset.id)
    wx.showToast({ title: '已移除', icon: 'none' })
    this.refresh()
  },

  back() { wx.switchTab({ url: '/pages/home/home' }) }
})
