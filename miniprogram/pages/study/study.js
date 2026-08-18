// pages/study/study.js —— 翻转卡学习（双重编码 + 趣味联想）
const words = require('../../data/words.js')
const store = require('../../utils/store.js')

Page({
  data: {
    bookId: '', level: 0, words: [], index: 0, total: 0,
    word: {}, flipped: false, done: false, percent: 0
  },

  onLoad(q) {
    const bookId = q.bookId
    const level = parseInt(q.level || '0')
    const list = words.getLevelWords(bookId, level)
    this.setData({
      bookId, level, words: list, total: list.length,
      word: list[0] || {}, percent: 0
    })
  },

  flip() { this.setData({ flipped: !this.data.flipped }) },

  speak() {
    // M1 占位：真实发音需接入 TTS（云函数 / 词典音频）。这里提示音标。
    wx.showToast({ title: this.data.word.phonetic, icon: 'none' })
  },

  known() {
    // 主动标记为“认识” → SRS 记一次熟记(grade 5)
    store.gradeWord(this.data.word.id, 5)
    store.markLearned(this.data.bookId, 1)
    this.next()
  },

  notKnown() {
    // 不认识 → SRS 记一次遗忘(grade 0)，立即进入复习队列
    store.gradeWord(this.data.word.id, 0)
    this.next()
  },

  next() {
    const i = this.data.index + 1
    if (i >= this.data.words.length) {
      this.setData({ done: true })
      return
    }
    this.setData({ index: i, word: this.data.words[i], flipped: false, percent: Math.round(i / this.data.words.length * 100) })
  },

  startQuiz() {
    wx.redirectTo({ url: `/pages/quiz/quiz?mode=new&bookId=${this.data.bookId}&level=${this.data.level}` })
  },

  back() { wx.navigateBack() }
})
