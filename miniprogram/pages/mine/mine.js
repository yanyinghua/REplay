// pages/mine/mine.js
const store = require('../../utils/store.js')
const words = require('../../utils/wordbank.js')

const BADGE_DEFS = [
  { name: '初出茅庐', icon: '🌱', test: (s) => s.learned >= 10 },
  { name: '百词斩', icon: '⚔️', test: (s) => s.learned >= 30 },
  { name: '七日不倒', icon: '🔥', test: (s) => s.streak >= 7 },
  { name: '进阶学者', icon: '🎓', test: (s) => s.level >= 3 },
  { name: '闯关达人', icon: '🏆', test: (s) => s.passedLevels >= 3 }
]

Page({
  data: { level: 1, expInLevel: 0, need: 200, expPercent: 0, coin: 0, streak: 0, learned: 0, badges: [], wrongCount: 0 },

  onShow() { this.refresh() },

  refresh() {
    const p = store.getProfile()
    // 统计已学词 & 通关数
    const prog = store.getProgress()
    let learned = 0, passedLevels = 0
    Object.keys(prog).forEach(bid => {
      learned += prog[bid].learned || 0
      const lv = prog[bid].levels || {}
      Object.keys(lv).forEach(k => { if (lv[k].passed) passedLevels++ })
    })
    const stats = { learned, streak: p.streak, level: p.level, passedLevels }
    const badges = BADGE_DEFS.filter(b => b.test(stats)).map(b => ({ name: b.name, icon: b.icon }))
    this.setData({
      level: p.level, expInLevel: p.exp % 200, need: 200,
      expPercent: Math.round((p.exp % 200) / 200 * 100),
      coin: p.coin, streak: p.streak, learned, badges,
      wrongCount: store.getWrongWordIds().length
    })
  },

  goMistakes() { wx.navigateTo({ url: '/pages/mistakes/mistakes' }) },
  goCurve() { wx.navigateTo({ url: '/pages/curve/curve' }) },

  reset() {
    wx.showModal({
      title: '清空进度', content: '确定清空本地学习与积分数据？',
      success: (r) => {
        if (!r.confirm) return
        wx.removeStorageSync('srs_state')
        wx.removeStorageSync('user_profile')
        wx.removeStorageSync('book_progress')
        wx.setStorageSync('srs_state', {})
        wx.setStorageSync('user_profile', { exp: 0, level: 1, coin: 0, streak: 0, lastCheckin: 0, badges: [], createdAt: Date.now() })
        wx.setStorageSync('book_progress', {})
        wx.showToast({ title: '已清空', icon: 'success' })
        this.refresh()
      }
    })
  }
})
