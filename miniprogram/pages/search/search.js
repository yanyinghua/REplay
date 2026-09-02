// pages/search/search.js —— 单词搜索
// 双通道：本地词库实时模糊匹配（离线秒出） + dict 云函数在线词典/自由翻译（任意单词、中英句子）
// 在线词典查到的词可一键加入「我的生词本」（虚拟词库 mybox），随后走正常学习/复习/错词本流程
const words = require('../../utils/wordbank.js')
const dict = require('../../utils/dict.js')
const store = require('../../utils/store.js')

let ready = false
let searchTimer = null

Page({
  data: {
    kw: '',
    autoFocus: true,
    ready: false,
    results: [],     // 本地词库模糊结果
    expanded: '',    // 本地结果展开项 key
    onlineLoading: false,
    online: null,    // 在线词典 / 翻译结果
    onlineErr: '',
    myWord: '',      // 当前在线词（小写），用于收藏状态
    myState: '',     // in=已在生词本 / local=本地词库已收录 / none=可收藏
    myCount: 0       // 生词本已有词数
  },

  onLoad(options) {
    // 支持从别处带词跳入（如首页热点句点词查询）
    const pre = options && options.q ? String(options.q).trim() : ''
    if (pre) {
      this.setData({ kw: pre, autoFocus: false })
      // 等词库就绪后 onLoad 尾部会自动 runQuery
    }
    // 确保已下载词库都就绪（内置立即返回；云端从本地缓存载入）
    words.loadCloudBooks().catch(() => {}).then(() => {
      const bs = words.getBooks().filter(b => b.downloaded)
      return Promise.all(bs.map(b => words.ensureBook(b.bookId).catch(() => [])))
    }).then(() => {
      ready = true
      this.setData({ ready: true })
      if (this.data.kw) this.runQuery(this.data.kw)
    }).catch(() => {
      ready = true
      this.setData({ ready: true })
    })
  },

  onUnload() {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
    this._tok = (this._tok || 0) + 1
  },

  onInput(e) {
    const kw = e.detail.value
    this.setData({ kw })
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => this.runQuery(kw), 150)
  },

  onClear() {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
    this.resetOnline()
    this.setData({ kw: '', results: [], expanded: '' })
  },

  back() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/books/books' })
  },

  // ---------------- 本地模糊匹配 ----------------
  rankOf(S, m, q) {
    if (S === q) return 0
    if (S.indexOf(q) === 0) return 1
    if (S.indexOf(q) > 0) return 2
    if (S.split(/[^a-z0-9]+/).some(t => t && t.length > q.length && t.indexOf(q) === 0)) return 3
    if (m.indexOf(q) >= 0) return 4
    return -1
  },

  doSearch(kw) {
    if (!ready) return
    const q = (kw || '').trim().toLowerCase()
    if (!q) {
      this.setData({ results: [], expanded: '' })
      return
    }
    const books = words.getBooks().filter(b => b.downloaded)
    const out = []
    const seen = {}
    for (let bi = 0; bi < books.length; bi++) {
      const book = books[bi]
      const list = words.getWords(book.bookId) || []
      for (let i = 0; i < list.length; i++) {
        const w = list[i]
        const key = book.bookId + ':' + w.id
        if (seen[key]) continue
        const S = (w.spell || '').toLowerCase()
        const m = (w.meaning || '').toLowerCase()
        const rank = this.rankOf(S, m, q)
        if (rank < 0) continue
        seen[key] = 1
        out.push({
          key,
          word: w,
          bookName: book.name || '',
          bookEmoji: book.emoji || '📘',
          rank
        })
      }
    }
    out.sort((a, b) =>
      a.rank - b.rank ||
      a.word.spell.length - b.word.spell.length ||
      (a.word.spell < b.word.spell ? -1 : 1))
    this.setData({ results: out.slice(0, 60), expanded: '' })
  },

  // ---------------- 在线词典 / 自由翻译 ----------------
  runQuery(kw) {
    const q = (kw || '').trim()
    this.doSearch(q)
    this.planOnline(q)
  },

  // 触发策略（像词典 App 那样随意输入）：
  //   英文单词/词串 → 有道词典给权威释义；
  //   中文或英文句子/短语 → 中英互译；
  //   特殊符号输入 → 跳过在线查询
  planOnline(q) {
    this._tok = (this._tok || 0) + 1
    const tok = this._tok
    if (!q || q.length < 2) { this.resetOnline(); return }

    const hasCjk = /[\u4e00-\u9fff]/.test(q)
    // 可上网的英文输入：单词，或含常见标点（. , ! ? : ; ' - & / 括号等）的完整句（如热点句点按进入）
    const englishish = /^[A-Za-z][A-Za-z0-9'’\-.&, !?;:()"\/]*$/.test(q)
    if (!englishish && !hasCjk) { this.resetOnline(); return }
    const letters = q.replace(/[^A-Za-z]/g, '').length
    if (englishish && letters < 3) { this.resetOnline(); return }  // 太短先走本地联想
    if (hasCjk && q.length < 2) { this.resetOnline(); return }

    this.setData({ onlineLoading: true, online: null, onlineErr: '', myState: '', myCount: words.getMyboxWords().length })
    dict.lookupOnline(q).then(res => {
      if (tok !== this._tok) return  // 输入已变化，丢弃过期结果
      if (res && res.ok) {
        const patch = { onlineLoading: false, online: res }
        if (res.mode === 'dict') {
          const st = this.computeMybox(res.word)
          patch.myWord = String(res.word).toLowerCase()
          patch.myState = st.state
          patch.myCount = st.count
        }
        this.setData(patch)
      } else this.setData({ onlineLoading: false, online: null, onlineErr: '在线查询暂不可用：请检查网络，并确认已把 cloudfunctions/dict 云函数「上传并部署」。' })
    })
  },

  resetOnline() {
    this._tok = (this._tok || 0) + 1
    if (!this.data.onlineLoading && !this.data.online && !this.data.onlineErr) return
    this.setData({ onlineLoading: false, online: null, onlineErr: '' })
  },

  retryOnline() {
    if (this.data.kw) this.planOnline(this.data.kw)
  },

  // 在线词典词的收藏状态：in=已在生词本 / local=本地词库已收录 / none=可收藏
  computeMybox(word) {
    const spell = String(word || '').trim().toLowerCase()
    const count = words.getMyboxWords().length
    if (!spell) return { state: '', count }
    let state = 'none'
    if (words.hasMyboxWord(spell)) state = 'in'
    else {
      const books = words.getBooks().filter(b => b.bookId !== 'mybox' && b.downloaded)
      outer:
      for (let i = 0; i < books.length; i++) {
        const list = words.getWords(books[i].bookId) || []
        for (let j = 0; j < list.length; j++) {
          if (String(list[j].spell || '').toLowerCase() === spell) { state = 'local'; break outer }
        }
      }
    }
    return { state, count }
  },

  // 把当前在线词典词收进生词本（词条字段与内置词库兼容，可直接进学习卡）
  addToBox() {
    const w = this.data.online
    if (!w || w.mode !== 'dict') return
    const spell = String(w.word || '').trim().toLowerCase()
    if (!spell) return
    const meaning = (w.senses || []).slice(0, 2).join('；')
    const phonetic = [
      w.usPhonetic ? ('美 /' + w.usPhonetic + '/') : '',
      w.ukPhonetic ? ('英 /' + w.ukPhonetic + '/') : ''
    ].filter(Boolean).join(' ')
    const ex = (w.examples && w.examples[0]) || {}
    const r = words.addMyboxWord({
      spell, phonetic, meaning,
      example: ex.en || '', exampleZh: ex.zh || ''
    })
    const st = this.computeMybox(spell)
    this.setData({ myWord: spell, myState: st.state, myCount: st.count })
    if (r && r.ok) wx.showToast({ title: '⭐ 已加入我的生词本', icon: 'none' })
    else if (r && r.exists) wx.showToast({ title: '这个单词已在生词本里啦', icon: 'none' })
  },

  // 移出生词本（同步清理该词的「已学/进度」记录，保持百分比一致）
  removeFromBox() {
    const w = this.data.online
    if (!w || w.mode !== 'dict') return
    const spell = String(w.word || '').trim().toLowerCase()
    if (!spell) return
    const learned = words.getLearnedIds('mybox')
    if (learned.indexOf(spell) >= 0) {
      words.removeLearned('mybox', spell)
      store.markLearned('mybox', -1)
    }
    words.removeMyboxWord(spell)
    const st = this.computeMybox(spell)
    this.setData({ myWord: spell, myState: st.state, myCount: st.count })
    wx.showToast({ title: '已移出生词本', icon: 'none' })
  },

  // 前往生词本选词 → 学习
  goStudyBox() {
    if (!words.getMyboxWords().length) {
      wx.showToast({ title: '生词本还是空的，先收藏几个词吧', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/pick/pick?bookId=mybox' })
  },

  toggle(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ expanded: this.data.expanded === key ? '' : key })
  },

  speak(e) {
    const w = e.currentTarget.dataset.w || ''
    if (!w) return
    if (this.audioCtx) this.audioCtx.destroy()
    const audio = wx.createInnerAudioContext()
    this.audioCtx = audio
    audio.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=1'
    audio.play()
    audio.onError(() => {
      wx.showToast({ title: '发音加载失败，请检查网络', icon: 'none' })
    })
  }
})
