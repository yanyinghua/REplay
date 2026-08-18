// pages/class/class.js —— M3.2 班级页
// 我的班级、建班、加班、班级详情(成员+班级榜)、分享班级卡片带 classId
Page({
  data: {
    myOpenid: '',
    myClasses: [],
    detail: null, // { classId, name, owner, members:[], board:[] }
    showCreate: false,
    newName: '',
    newGoal: '',
    joinId: '',
    autoTip: '',
  },

  async onLoad(q) {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      this.setData({ myOpenid: (res.result && res.result.openid) || '' })
    } catch (e) {
      console.error('login fail', e)
    }
    this.loadMy()
    if (q && q.classId) this.autoJoin(q.classId)
  },

  onShow() {
    this.loadMy()
    if (this.data.detail) this.openDetail({ currentTarget: { dataset: { id: this.data.detail.classId } } })
  },

  async loadMy() {
    try {
      const res = await wx.cloud.callFunction({ name: 'class', data: { action: 'my' } })
      this.setData({ myClasses: (res.result && res.result.list) || [] })
    } catch (e) {
      console.error('my fail', e)
    }
  },

  toggleCreate() {
    this.setData({ showCreate: !this.data.showCreate })
  },
  onName(e) {
    this.setData({ newName: e.detail.value })
  },
  onGoal(e) {
    this.setData({ newGoal: e.detail.value })
  },
  onJoinId(e) {
    this.setData({ joinId: e.detail.value })
  },

  async createClass() {
    const name = this.data.newName.trim()
    if (!name) {
      wx.showToast({ title: '请输入班级名', icon: 'none' })
      return
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'class',
        data: { action: 'create', name, goalText: this.data.newGoal },
      })
      if (res.result && res.result.error) {
        wx.showToast({ title: res.result.error, icon: 'none' })
        return
      }
      wx.showToast({ title: '建班成功', icon: 'none' })
      this.setData({ showCreate: false, newName: '', newGoal: '' })
      this.loadMy()
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '建班失败', icon: 'none' })
    }
  },

  async doJoin() {
    const classId = this.data.joinId.trim()
    if (!classId) {
      wx.showToast({ title: '请输入班级 ID', icon: 'none' })
      return
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'class', data: { action: 'join', classId } })
      if (res.result && res.result.error) {
        wx.showToast({ title: res.result.error, icon: 'none' })
        return
      }
      wx.showToast({ title: '已加入', icon: 'none' })
      this.setData({ joinId: '' })
      this.loadMy()
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加入失败', icon: 'none' })
    }
  },

  async autoJoin(classId) {
    try {
      const res = await wx.cloud.callFunction({ name: 'class', data: { action: 'join', classId } })
      if (res.result && res.result.joined) {
        this.setData({ autoTip: '已加入班级，快去班级榜看看吧！' })
        this.loadMy()
      }
    } catch (e) {
      console.error('autoJoin fail', e)
    }
  },

  async openDetail(e) {
    const classId = e.currentTarget.dataset.id
    try {
      const [m, b] = await Promise.all([
        wx.cloud.callFunction({ name: 'class', data: { action: 'members', classId } }),
        wx.cloud.callFunction({ name: 'class', data: { action: 'board', classId } }),
      ])
      const members = (m.result && m.result.members) || []
      const board = (b.result && b.result.board) || []
      this.setData({
        detail: { classId, name: (m.result && m.result.name) || '', members, board },
      })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async quitClass(e) {
    const classId = e.currentTarget.dataset.id
    try {
      await wx.cloud.callFunction({ name: 'class', data: { action: 'quit', classId } })
      wx.showToast({ title: '已退出', icon: 'none' })
      this.setData({ detail: null })
      this.loadMy()
    } catch (err) {
      console.error(err)
    }
  },

  onShareAppMessage() {
    const c = this.data.detail
    if (!c) return { title: '来我的班级一起背单词', path: '/pages/class/class' }
    return { title: '加入我的班级：' + c.name, path: '/pages/class/class?classId=' + c.classId }
  },
})
