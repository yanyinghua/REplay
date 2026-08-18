// pages/quiz/quiz.js —— 主动回忆测验（新词闯关 + 到期复习共用）
const words = require('../../data/words.js')
const store = require('../../utils/store.js')

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
    feedback: '', percent: 0,
    finished: false, accuracy: 0, stars: 0,
    gainExp: 0, gainCoin: 0, leveledUp: false, newLevel: 1
  },

  onLoad(q) {
    const mode = q.mode || 'new'
    let list = []
    if (mode === 'review') {
      const due = store.getDueWordIds()
      list = due.map(id => words.getWord(id)).filter(Boolean)
    } else if (mode === 'wrong') {
      const ids = store.getWrongWordIds()
      list = ids.map(id => words.getWord(id)).filter(Boolean)
    } else {
      const bookId = q.bookId
      const level = parseInt(q.level || '0')
      list = words.getLevelWords(bookId, level)
      this.setData({ bookId, level })
    }
    this.setData({ mode, list, total: list.length })
    if (list.length) this.loadQuestion(0)
  },

  loadQuestion(i) {
    const word = this.data.list[i]
    // 从同词库挑 3 个干扰项
    const pool = words.getWords(word.bookId).map(w => w.spell).filter(s => s !== word.spell)
    const distract = shuffle(pool).slice(0, 3)
    const choices = shuffle([word.spell, ...distract])
    this.setData({
      index: i, word, choices, selected: '', answered: false, feedback: '',
      percent: Math.round(i / this.data.total * 100)
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
  },

  next() {
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

  back() { wx.switchTab({ url: '/pages/home/home' }) }
})
