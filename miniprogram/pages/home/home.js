// pages/home/home.js
const store = require('../../utils/store.js')
const ret = require('../../utils/retention.js')
const words = require('../../data/words.js')

Page({
  data: {
    level: 1, expInLevel: 0, need: 200, expPercent: 0,
    coin: 0, streak: 0,
    dueCount: 0, retention: 100, wrongCount: 0,
    checkinText: '今日未打卡', checkinBonus: 12
  },

  onShow() { this.refresh() },

  refresh() {
    const p = store.getProfile()
    const expInLevel = p.exp % 200
    const need = 200
    const dueIds = store.getDueWordIds()
    // 留存率：已学词中未到期的比例
    const all = wx.getStorageSync('srs_state') || {}
    const learned = Object.keys(all).length
    const due = dueIds.length
    const retention = learned === 0 ? 100 : Math.round(ret.overallRetention(all, Date.now()) * 100)
    // 今日是否已打卡
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const checked = p.lastCheckin && new Date(p.lastCheckin).setHours(0, 0, 0, 0) === today.getTime()
    this.setData({
      level: p.level, expInLevel, need, expPercent: Math.round(expInLevel / need * 100),
      coin: p.coin, streak: p.streak,
      dueCount: due, retention: Math.max(0, Math.min(100, retention)),
      wrongCount: store.getWrongWordIds().length,
      checkinText: checked ? '今日已打卡 ✅' : '点击完成今日打卡',
      checkinBonus: (p.streak + 1) * 2 + 10
    })
  },

  onCheckIn() {
    const res = store.checkIn()
    if (!res.ok) { wx.showToast({ title: '今天已打卡', icon: 'none' }); this.refresh(); return }
    wx.showToast({ title: '打卡 +' + ((res.streak) * 2 + 10) + ' 连续' + res.streak + '天', icon: 'none' })
    this.refresh()
  },

  goBooks() { wx.switchTab({ url: '/pages/books/books' }) },
  goMistakes() { wx.navigateTo({ url: '/pages/mistakes/mistakes' }) },
  goCurve() { wx.navigateTo({ url: '/pages/curve/curve' }) },
  goPK() { wx.navigateTo({ url: '/pages/pkroom/pkroom?bookId=daily&level=0' }) },
  goRank() { wx.navigateTo({ url: '/pages/rank/rank' }) },
  goFriend() { wx.navigateTo({ url: '/pages/friend/friend' }) },
  goClass() { wx.navigateTo({ url: '/pages/class/class' }) },
  goMap() { wx.switchTab({ url: '/pages/map/map' }) },
  goReview() {
    if (this.data.dueCount === 0) { wx.showToast({ title: '暂无到期词', icon: 'none' }); return }
    wx.navigateTo({ url: '/pages/review/review' })
  }
})
