// pages/friend/friend.js —— M3.2 好友页
// 搜索加好友（昵称）、我的好友列表、关注/取关、分享卡片带本人 openid
const DB = wx.cloud.database()

Page({
  data: {
    myOpenid: '',
    searchKey: '',
    searchResult: [],
    friends: [],
    fromTip: '',
  },

  async onLoad(q) {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      this.setData({ myOpenid: (res.result && res.result.openid) || '' })
    } catch (e) {
      console.error('login fail', e)
    }
    this.refreshFriends()
    if (q && q.from && q.from !== this.data.myOpenid) {
      this.autoFollow(q.from)
    }
  },

  onShow() {
    this.refreshFriends()
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
  },

  async doSearch() {
    const kw = this.data.searchKey.trim()
    if (!kw) {
      this.setData({ searchResult: [] })
      return
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'follow', data: { action: 'search', nickName: kw } })
      this.setData({ searchResult: (res.result && res.result.list) || [] })
    } catch (e) {
      console.error('search fail', e)
      wx.showToast({ title: '搜索失败', icon: 'none' })
    }
  },

  async refreshFriends() {
    try {
      const res = await wx.cloud.callFunction({ name: 'follow', data: { action: 'list' } })
      this.setData({ friends: (res.result && res.result.list) || [] })
    } catch (e) {
      console.error('list fail', e)
    }
  },

  async doFollow(e) {
    const target = e.currentTarget.dataset.openid
    try {
      const res = await wx.cloud.callFunction({ name: 'follow', data: { action: 'follow', targetOpenid: target } })
      if (res.result && res.result.error) {
        wx.showToast({ title: res.result.error, icon: 'none' })
        return
      }
      wx.showToast({ title: '已加好友', icon: 'none' })
      this.setData({ searchResult: [] })
      this.refreshFriends()
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async doUnfollow(e) {
    const target = e.currentTarget.dataset.openid
    try {
      await wx.cloud.callFunction({ name: 'follow', data: { action: 'unfollow', targetOpenid: target } })
      wx.showToast({ title: '已取消关注', icon: 'none' })
      this.refreshFriends()
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async autoFollow(from) {
    try {
      const res = await wx.cloud.callFunction({ name: 'follow', data: { action: 'follow', targetOpenid: from } })
      if (res.result && res.result.isNew) {
        this.setData({ fromTip: '已和对方成为好友，一起去排行榜 PK 吧！' })
        this.refreshFriends()
      }
    } catch (e) {
      console.error('autoFollow fail', e)
    }
  },

  onShareAppMessage() {
    return {
      title: '来和我一起背单词，PK 见高低！',
      path: '/pages/friend/friend?from=' + (this.data.myOpenid || ''),
    }
  },
})
