// pages/quiz/quiz.js —— 主动回忆测验（新词闯关 + 到期复习共用）
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')
const typeface = require('../../utils/typeface.js')

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

Page({
  data: {
    mode: 'new', bookId: '', level: 0,
    list: [], index: 0, total: 0, word: {}, choices: [],
    selected: '', answered: false, correct: 0,
    feedback: '', percent: 0, sentenceText: '',
    finished: false, accuracy: 0, stars: 0,
    gainExp: 0, gainCoin: 0, leveledUp: false, newLevel: 1,
    faceStack: typeface.loadStack()  // 题目/选项字体（与学习页同一偏好）
  },

  // 字体选择组件上抛时应用
  onFace(e) {
    this.setData({ faceStack: e.detail.stack })
  },

  onLoad(q) {
    const mode = q.mode || 'new'
    let list = []
    let realMode = mode
    if (mode === 'review') {
      const due = store.getDueWordIds()
      list = due.map(id => words.getWord(id)).filter(Boolean)
    } else if (mode === 'wrong') {
      const ids = store.getWrongWordIds()
      list = ids.map(id => words.getWord(id)).filter(Boolean)
    } else {
      const bookId = q.bookId
      const level = parseInt(q.level || '0')
      let base = []
      if (q.ids) base = (words.getPickIds(bookId) || []).map(id => words.getWord(id)).filter(Boolean)
      else base = words.getLevelWords(bookId, level)
      if (mode === 'sentence') {
        // 句子练习：只取有例句的词；例句素材不足时自动降级为拼写测验，避免空状态
        const withEx = base.filter(w => w.example && w.example.trim())
        if (withEx.length >= 3) {
          list = withEx
        } else {
          list = base
          realMode = q.ids ? 'custom' : 'new'
          wx.showToast({ title: '当前词库暂无例句，已自动切换为拼写测验', icon: 'none' })
        }
      } else {
        list = base
      }
      this.setData({ bookId, level })
    }
    this.setData({ mode: realMode, list, total: list.length })
    if (list.length) this.loadQuestion(0)
  },

  onUnload() {
    if (this.autoTimer) clearTimeout(this.autoTimer)
  },

  loadQuestion(i) {
    const word = this.data.list[i]
    // 从同词库挑 3 个干扰项；词库词太少时从其他词库补充
    const pool = words.getWords(word.bookId).map(w => w.spell).filter(s => s !== word.spell)
    if (pool.length < 3) {
      const extra = []
      words.getBooks().forEach(b => {
        if (extra.length >= 3) return
        words.getWords(b.bookId).forEach(w => {
          if (extra.length >= 3) return
          if (w.spell !== word.spell && pool.indexOf(w.spell) < 0 && extra.indexOf(w.spell) < 0) extra.push(w.spell)
        })
      })
      pool.push.apply(pool, extra)
    }
    const distract = shuffle(pool).slice(0, 3)
    const choices = shuffle([word.spell, ...distract])
    // 句子练习：把例句里的目标词挖空
    // 用例句中实际出现的词形（exampleTarget）精确匹配，避免误挖同形异义词（如 its/it）
    let sentenceText = ''
    if (this.data.mode === 'sentence' && word.example) {
      const target = word.exampleTarget || word.spell
      const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      sentenceText = word.example.replace(new RegExp('\\b' + esc + '\\b', 'gi'), ' ____ ')
    }
    this.setData({
      index: i, word, choices, selected: '', answered: false, feedback: '',
      percent: Math.round(i / this.data.total * 100),
      sentenceText
    })
  },

  choose(e) {
    if (this.data.answered) return
    const opt = e.currentTarget.dataset.opt
    const ok = opt === this.data.word.spell
    if (this.data.mode === 'wrong') store.gradeWrongMode(this.data.word.id, ok) // 错词巩固：答对 lapses-1
    else store.gradeWord(this.data.word.id, ok ? 5 : 0) // 主动回忆评分 → 更新 SRS
    this.setData({
      selected: opt, answered: true,
      correct: this.data.correct + (ok ? 1 : 0),
      feedback: ok ? '🎯 答对了！已加入记忆' : '✏️ 正确答案：' + this.data.word.spell
    })
    // 答对自动进下一题（留 700ms 让用户看到正确反馈）
    if (ok) {
      if (this.autoTimer) clearTimeout(this.autoTimer)
      this.autoTimer = setTimeout(() => this.next(), 700)
    }
  },

  next() {
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null }
    const i = this.data.index + 1
    if (i >= this.data.total) return this.finish()
    this.loadQuestion(i)
  },

  finish() {
    const total = this.data.total
    const correct = this.data.correct
    const accuracy = total ? Math.round(correct / total * 100) : 0
    const stars = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 50 ? 1 : 0

    // 奖励
    const gainExp = correct * 10 + (stars > 0 ? 20 : 0)
    const gainCoin = stars > 0 ? 10 : 3
    const r = store.addReward(gainExp, gainCoin)

    if (this.data.mode === 'new') {
      store.saveLevelResult(this.data.bookId, this.data.level, stars, accuracy)
    }

    this.setData({
      finished: true, accuracy, stars,
      gainExp, gainCoin,
      leveledUp: r.leveledUp, newLevel: r.profile.level
    })
  },

  retry() {
    // 重置当前 session
    this.setData({
      index: 0, correct: 0, finished: false, percent: 0,
      gainExp: 0, gainCoin: 0, leveledUp: false
    })
    if (this.data.list.length) this.loadQuestion(0)
  },

  back() {
    // 优先返回上一页（如学习页），可在「闯关测验 / 句子练习」之间来回切换；无上一页时回首页
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/home/home' })
  }
})
