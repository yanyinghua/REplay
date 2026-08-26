// pages/rank/rank.js —— M3.1 好友排行榜
// 流程：login 取 openid → sync 合并本地进度到云端 → getRank 拉榜
// 实时刷新：进入拉取 + 下拉刷新 + 每 20s 轮询（规划中的 watch rank_snapshot 可后续替换）
const store = require('../../utils/store.js')

const SCOPES = [
  { key: 'total', label: '总榜', unit: '经验' },
  { key: 'learned', label: '词汇榜', unit: '词' },
  { key: 'streak', label: '坚持榜', unit: '天' },
  { key: 'book', label: '词库榜', unit: '⭐' },
]
const BOOKS = [
  { id: 'daily', label: '日常高频' },
  { id: 'cet4', label: '四级核心' },
]

Page({
  data: {
    scopes: SCOPES,
    books: BOOKS,
    scope: 'total',
    bookId: 'daily',
    friendOnly: false,
    board: [],
    me: null,
    topValue: 0,
    unit: '经验',
    loading: false,
    friendTip: '',
  },

  _timer: null,
  _openid: '',

  onLoad() {
    this.bootstrap()
  },

  async bootstrap() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      this._openid = (res.result && res.result.openid) || ''
    } catch (e) {
      console.error('login fail', e)
    }
    // 合并本地进度到云端，使榜单有真实数据（M3.0 将统一为 syncProfile）
    await this.syncLocal()
    this.loadRank()
    // 轮询刷新
    this._timer = setInterval(() => this.loadRank(true), 20000)
  },

  onPullDownRefresh() {
    this.loadRank().then(() => wx.stopPullDownRefresh())
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer)
  },
  onHide() {
    if (this._timer) clearInterval(this._timer)
  },
  onShow() {
    if (!this._timer) this._timer = setInterval(() => this.loadRank(true), 20000)
  },

  // 本地→云最小化合并
  async syncLocal() {
    const p = store.getProfile() || {}
    const prog = store.getProgress() || {}
    const bookProgress = {}
    for (const bk of Object.keys(prog)) {
      const b = prog[bk] || {}
      let stars = 0
      const levels = b.levels || {}
      for (const lv of Object.keys(levels)) stars = Math.max(stars, levels[lv].stars || 0)
      bookProgress[bk] = { stars, learned: b.learned || 0 }
    }
    try {
      await wx.cloud.callFunction({
        name: 'rank',
        data: {
          action: 'sync',
          exp: p.exp || 0,
          coin: p.coin || 0,
          streak: p.streak || 0,
          level: p.level || 1,
          learnedTotal: Object.values(prog).reduce((s, b) => s + (b.learned || 0), 0),
          bookProgress,
        },
      })
    } catch (e) {
      console.error('sync fail', e)
    }
  },

  async loadRank(silent) {
    if (!silent) this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'rank',
        data: {
          action: 'getRank',
          scope: this.data.scope,
          bookId: this.data.bookId,
          friends: this.data.friendOnly,
          limit: 50,
        },
      })
      const r = res.result || {}
      const board = r.board || []
      this.setData({
        board,
        me: r.me || null,
        topValue: board.length ? board[0].value : 0,
        unit: r.unit || '经验',
        friendTip:
          this.data.friendOnly && !r.friendOnly
            ? '尚未关注好友，已展示全量榜单（关注功能在 M3.2 上线）'
            : '',
        loading: false,
      })
    } catch (e) {
      console.error('getRank fail', e)
      this.setData({ loading: false })
      if (!silent) wx.showToast({ title: '榜单加载失败', icon: 'none' })
    }
  },

  onSwitchScope(e) {
    const scope = e.currentTarget.dataset.scope
    if (scope === this.data.scope) return
    this.setData({ scope }, () => this.loadRank())
  },

  onSwitchBook(e) {
    const idx = Number(e.detail.value)
    const bookId = this.data.books[idx].id
    this.setData({ bookId }, () => this.loadRank())
  },

  onToggleFriend(e) {
    this.setData({ friendOnly: e.detail.value }, () => this.loadRank())
  },

  // 与第一名差距
  gapOf(value) {
    const top = this.data.topValue || 0
    return top > value ? top - value : 0
  },
})
