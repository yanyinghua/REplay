// pages/study/study.js —— 翻转卡学习（双重编码 + 趣味联想）
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')

Page({
  data: {
    bookId: '', level: 0, words: [], index: 0, total: 0,
    word: {}, flipped: false, done: false, percent: 0
  },

  onLoad(q) {
    const bookId = q.bookId
    const level = parseInt(q.level || '0')
    words.ensureBook(bookId).then(() => {
      const list = words.getLevelWords(bookId, level)
      this.setData({
        bookId, level, words: list, total: list.length,
        word: list[0] || {}, percent: 0
      })
    }).catch(err => {
      wx.showToast({ title: err.message || '加载词库失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    })
  },

  flip() { this.setData({ flipped: !this.data.flipped }) },

  // 播放单词发音（有道词典免费发音接口）
  speak() {
    const w = this.data.word.spell
    if (!w) return
    if (this.audioCtx) this.audioCtx.destroy()
    const audio = wx.createInnerAudioContext()
    this.audioCtx = audio
    audio.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=1'
    audio.play()
    audio.onError(() => {
      wx.showToast({ title: '发音加载失败，请检查网络', icon: 'none' })
    })
  },

  onUnload() {
    if (this.audioCtx) this.audioCtx.destroy()
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
