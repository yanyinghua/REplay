// pages/interests/interests.js —— 兴趣标签选择（首次引导 / 「我的」页可随时修改）
const store = require('../../utils/store.js')
const trending = require('../../utils/trending.js')

Page({
  data: {
    list: [],      // 可选兴趣（icon/name/id）
    sel: {},       // id → true
    chosen: 0,
    guide: false   // 是否为首次引导进入
  },

  onLoad(options) {
    const guide = !!(options && options.guide === '1')
    const cur = store.getInterestTags()
    const sel = {}
    cur.forEach(id => { sel[id] = true })
    this.setData({ list: trending.INTERESTS, sel, chosen: cur.length, guide })
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id
    const on = !this.data.sel[id]
    this.setData({ ['sel.' + id]: on, chosen: this.data.chosen + (on ? 1 : -1) })
  },

  save() {
    const ids = trending.INTERESTS.map(i => i.id).filter(id => this.data.sel[id])
    if (!ids.length) {
      wx.showToast({ title: '至少选 1 个感兴趣的话题', icon: 'none' })
      return
    }
    store.setInterestTags(ids)
    wx.setStorageSync('interest_guided', '1')
    wx.showToast({ title: '已保存，首页热点将按兴趣推送', icon: 'none' })
    setTimeout(() => this.goBack(), 600)
  },

  // 跳过引导：不写兴趣（首页回退为「为你精选」全部内容），但记录已引导过
  skip() {
    wx.setStorageSync('interest_guided', '1')
    this.goBack()
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/home/home' })
  }
})
