// pages/pick/pick.js —— 选词：勾选不认识的单词 → 开始学习
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')

const PAGE_SIZE = 60

Page({
  data: {
    bookId: '', book: null,
    keyword: '',
    shown: [],       // 当前页显示的词（含 checked 标记）
    total: 0, selCount: 0,
    unlockMode: false, unlockCount: 0,   // 批量解锁模式
    loading: false, hasMore: true, ready: false
  },

  onLoad(q) {
    const bookId = q.bookId
    this.setData({ bookId })
    this.selected = {} // id -> true（不放进 data，避免大对象渲染）
    this.unlockSelected = {} // 批量解锁模式下选中的已学词 id -> true
    this.learned = new Set(words.getLearnedIds(bookId) || []) // 已学单词（锁定，双击解锁）
    this.full = []     // 过滤后的完整列表
    this.offset = 0

    words.ensureBook(bookId).then(() => {
      const book = words.getBooks().find(b => b.bookId === bookId) || { name: '', emoji: '' }
      // 恢复上次勾选（已学的除外，避免再次进入学习）
      ;(words.getPickIds(bookId) || []).forEach(id => { if (!this.learned.has(id)) this.selected[id] = true })
      this.full = words.getWords(bookId).slice()
      this.setData({
        book, total: this.full.length,
        selCount: Object.keys(this.selected).length,
        ready: true
      })
      this.loadMore()
    }).catch(err => {
      wx.showToast({ title: err.message || '词库加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    })
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.ready) this.loadMore()
  },

  loadMore() {
    if (this.data.loading || !this.data.hasMore) return
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const list = kw ? this.full.filter(w => w.spell.indexOf(kw) >= 0 || (w.meaning || '').indexOf(this.data.keyword) >= 0) : this.full
    const start = this.offset
    const end = start + PAGE_SIZE
    const slice = list.slice(start, end)
    this.offset = end
    const shown = slice.map(w => ({
      id: w.id, spell: w.spell, meaning: w.meaning,
      checked: !!this.selected[w.id],
      learned: this.learned.has(w.id)
    }))
    this.setData({
      shown: this.data.shown.concat(shown),
      loading: false,
      hasMore: end < list.length,
      // 同步过滤后的总数显示
      total: list.length
    })
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value, shown: [], hasMore: true })
    this.offset = 0
    this.loadMore()
  },

  clearSearch() {
    this.setData({ keyword: '', shown: [], hasMore: true })
    this.offset = 0
    this.loadMore()
  },

  tick(e) {
    const id = e.currentTarget.dataset.id
    const idx = e.currentTarget.dataset.idx
    const now = Date.now()
    // 批量解锁模式：单击已学单词切换解锁选择
    if (this.data.unlockMode) {
      if (!this.learned.has(id)) {
        wx.showToast({ title: '这是未学单词，无需解锁', icon: 'none' })
        return
      }
      if (this.unlockSelected[id]) {
        delete this.unlockSelected[id]
        this.setData({
          ['shown[' + idx + '].checked']: false,
          unlockCount: Object.keys(this.unlockSelected).length
        })
      } else {
        this.unlockSelected[id] = true
        this.setData({
          ['shown[' + idx + '].checked']: true,
          unlockCount: Object.keys(this.unlockSelected).length
        })
      }
      return
    }
    // 双击：解锁已学单词 → 恢复可选状态
    if (this.lastTapId === id && now - this.lastTapTime < 300) {
      this.lastTapId = null
      this.lastTapTime = 0
      if (this.learned.has(id)) {
        this.learned.delete(id)
        words.removeLearned(this.data.bookId, id)
        store.markLearned(this.data.bookId, -1) // 双击解锁同步扣减统计
        delete this.selected[id] // 解锁后回到未勾选，需重新点选
        this.setData({
          ['shown[' + idx + '].learned']: false,
          ['shown[' + idx + '].checked']: false,
          selCount: Object.keys(this.selected).length
        })
        wx.showToast({ title: '已解锁，可重新选择', icon: 'none' })
      }
      return
    }
    this.lastTapId = id
    this.lastTapTime = now
    // 已学单词：单击无效，需双击解锁
    if (this.learned.has(id)) {
      wx.showToast({ title: '已学过，双击可解锁重选', icon: 'none' })
      return
    }
    if (this.selected[id]) {
      delete this.selected[id]
      this.setData({
        ['shown[' + idx + '].checked']: false,
        selCount: Object.keys(this.selected).length
      })
    } else {
      this.selected[id] = true
      this.setData({
        ['shown[' + idx + '].checked']: true,
        selCount: Object.keys(this.selected).length
      })
    }
  },

  selectAll() {
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const list = kw
      ? this.full.filter(w => w.spell.indexOf(kw) >= 0 || (w.meaning || '').indexOf(this.data.keyword) >= 0)
      : this.full
    // 解锁模式：全选已学单词（准备解锁）
    if (this.data.unlockMode) {
      list.forEach(w => { if (this.learned.has(w.id)) this.unlockSelected[w.id] = true })
      const shown = this.data.shown.map(s => Object.assign({}, s, { checked: !!this.unlockSelected[s.id] }))
      this.setData({ shown, unlockCount: Object.keys(this.unlockSelected).length })
      return
    }
    // 普通模式：全选只选未学过的单词
    list.forEach(w => { if (!this.learned.has(w.id)) this.selected[w.id] = true })
    const shown = this.data.shown.map(s => Object.assign({}, s, { checked: !!this.selected[s.id] }))
    this.setData({ shown, selCount: Object.keys(this.selected).length })
  },

  clearAll() {
    // 解锁模式：清空解锁选择
    if (this.data.unlockMode) {
      this.unlockSelected = {}
      const shown = this.data.shown.map(s => Object.assign({}, s, { checked: false }))
      this.setData({ shown, unlockCount: 0 })
      return
    }
    this.selected = {}
    const shown = this.data.shown.map(s => Object.assign({}, s, { checked: false }))
    this.setData({ shown, selCount: 0 })
  },

  // 批量标记已学：把勾选的认识/简单单词移入已学习库（锁定），双击可解锁重学
  markLearned() {
    const ids = Object.keys(this.selected).filter(id => !this.learned.has(id))
    if (!ids.length) {
      wx.showToast({ title: '请先勾选认识/想跳过的单词', icon: 'none' })
      return
    }
    const bookId = this.data.bookId
    words.addLearnedBatch(bookId, ids)
    store.markLearned(bookId, ids.length)   // 批量标记也计入已学统计
    ids.forEach(id => { this.learned.add(id); delete this.selected[id] })
    // 从待学列表（pick_ids）中移除，避免下次进入又被恢复勾选
    const pick = (words.getPickIds(bookId) || []).filter(id => !this.learned.has(id))
    words.setPickIds(bookId, pick)
    // 刷新当前页显示状态
    const learnedSet = new Set(ids)
    const shown = this.data.shown.map(s =>
      learnedSet.has(s.id) ? Object.assign({}, s, { checked: false, learned: true }) : s
    )
    this.setData({ shown, selCount: Object.keys(this.selected).length })
    wx.showToast({ title: `已将 ${ids.length} 个单词移入已学习库`, icon: 'none' })
  },

  // 进入/退出批量解锁模式
  toggleUnlockMode() {
    const unlockMode = !this.data.unlockMode
    this.unlockSelected = {}
    // 切换勾选显示：解锁模式显示解锁选择，普通模式显示待学选择
    const shown = this.data.shown.map(s => Object.assign({}, s, {
      checked: unlockMode ? false : !!this.selected[s.id]
    }))
    this.setData({ unlockMode, shown, unlockCount: 0 })
    if (unlockMode) wx.showToast({ title: '点击已学单词选中，可多选后批量解锁', icon: 'none' })
  },

  // 批量解锁：把选中的已学单词移出已学习库，恢复可学
  unlockBatch() {
    const ids = Object.keys(this.unlockSelected)
    if (!ids.length) {
      wx.showToast({ title: '请先点击选择要解锁的已学单词', icon: 'none' })
      return
    }
    const bookId = this.data.bookId
    words.removeLearnedBatch(bookId, ids)
    store.markLearned(bookId, -ids.length)   // 解锁同步扣减已学统计
    ids.forEach(id => this.learned.delete(id))
    const unlockSet = new Set(ids)
    const shown = this.data.shown.map(s =>
      unlockSet.has(s.id) ? Object.assign({}, s, { checked: false, learned: false }) : s
    )
    this.unlockSelected = {}
    this.setData({ shown, unlockMode: false, unlockCount: 0 })
    wx.showToast({ title: `已解锁 ${ids.length} 个单词，可重新勾选学习`, icon: 'none' })
  },

  start() {
    // 双重保险：即使 selected 里残留已学单词也排除
    const ids = Object.keys(this.selected).filter(id => !this.learned.has(id))
    if (!ids.length) {
      wx.showToast({ title: '请先勾选要学习的单词', icon: 'none' })
      return
    }
    words.setPickIds(this.data.bookId, ids)
    wx.redirectTo({ url: `/pages/study/study?bookId=${this.data.bookId}&ids=1` })
  },

  back() { wx.navigateBack() }
})
