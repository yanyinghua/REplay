// pages/study/study.js —— 翻转卡学习（双重编码 + 趣味联想）
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')

Page({
  data: {
    bookId: '', level: 0, words: [], index: 0, total: 0,
    word: {}, flipped: false, done: false, percent: 0,
    isCustom: false,
    hand: 'right',   // 操作手：left=按钮在左侧(不认识下) right=右侧(认识下)
    cardH: 0         // 背面内容实测高度(px)，0=使用默认高度
  },

  onLoad(q) {
    const bookId = q.bookId
    const level = parseInt(q.level || '0')
    this.setData({ hand: store.getHandMode() })
    words.ensureBook(bookId).then(() => {
      let list
      let isCustom = false
      // 自定义选词模式：ids=1 时读取选词页勾选的单词
      if (q.ids) {
        // 过滤已学单词：学过的默认不再进入学习（除非在选词页双击解锁）
        const learned = new Set(words.getLearnedIds(bookId) || [])
        list = (words.getPickIds(bookId) || []).filter(id => !learned.has(id)).map(id => words.getWord(id)).filter(Boolean)
        isCustom = list.length > 0
        if (!isCustom) {
          wx.showToast({ title: '所选单词已全部学完，请重新选词', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 900)
          return
        }
      }
      if (!isCustom) list = words.getLevelWords(bookId, level)
      this.setData({
        bookId, level, words: list, total: list.length,
        word: list[0] || {}, percent: 0, isCustom
      })
    }).catch(err => {
      wx.showToast({ title: err.message || '加载词库失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    })
  },

  // 翻转卡片；翻到背面时动态测量内容高度并撑开卡片，避免释义被底部按钮遮挡
  flip() {
    const flipped = !this.data.flipped
    this.setData({ flipped })
    if (!flipped) { this.setData({ cardH: 0 }); return }
    wx.nextTick(() => {
      this.createSelectorQuery()
        .select('.flip-back')
        .fields({ size: true, scrollOffset: true }, res => {
          if (res) {
            const h = Math.max(res.height || 0, res.scrollHeight || 0)
            if (h > 0) this.setData({ cardH: Math.ceil(h) })
          }
        })
        .exec()
    })
  },

  // 切换操作手（学习时按钮布局），并持久化到设置
  toggleHand() {
    const hand = this.data.hand === 'left' ? 'right' : 'left'
    store.setHandMode(hand)
    this.setData({ hand })
    wx.showToast({ title: hand === 'left' ? '已切换：按钮在左侧(不认识下)' : '已切换：按钮在右侧(认识下)', icon: 'none' })
  },

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
    if (this.timer) clearTimeout(this.timer)
  },

  known() {
    // 主动标记为“认识” → SRS 记一次熟记(grade 5)
    store.gradeWord(this.data.word.id, 5)
    store.markLearned(this.data.bookId, 1)
    words.addLearned(this.data.bookId, this.data.word.id)
    this.next()
  },

  notKnown() {
    // 不认识 → SRS 记一次遗忘(grade 0)，立即进入复习队列
    store.gradeWord(this.data.word.id, 0)
    words.addLearned(this.data.bookId, this.data.word.id)
    this.next()
  },

  prev() {
    const i = this.data.index - 1
    if (i < 0) {
      wx.showToast({ title: '已经是第一个单词啦', icon: 'none' })
      return
    }
    this.setData({ index: i, word: this.data.words[i], flipped: false, cardH: 0, percent: Math.round(i / this.data.words.length * 100) })
  },

  next() {
    const i = this.data.index + 1
    if (i >= this.data.words.length) {
      this.setData({ done: true })
      return
    }
    this.setData({ index: i, word: this.data.words[i], flipped: false, cardH: 0, percent: Math.round(i / this.data.words.length * 100) })
  },

  startQuiz() {
    // 用 navigateTo 保留本页：做完测验可返回继续选择「句子练习」
    const base = `/pages/quiz/quiz?mode=${this.data.isCustom ? 'custom' : 'new'}&bookId=${this.data.bookId}`
    wx.navigateTo({ url: base + (this.data.isCustom ? '&ids=1' : `&level=${this.data.level}`) })
  },

  startSentence() {
    // 句子练习：用当前学习列表中有例句的词出题（同样保留本页便于返回再选）
    const base = `/pages/quiz/quiz?mode=sentence&bookId=${this.data.bookId}`
    wx.navigateTo({ url: base + (this.data.isCustom ? '&ids=1' : `&level=${this.data.level}`) })
  },

  back() { wx.navigateBack() }
})
