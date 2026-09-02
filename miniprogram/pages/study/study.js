// pages/study/study.js —— 翻转卡学习（双重编码 + 趣味联想）
const words = require('../../utils/wordbank.js')
const store = require('../../utils/store.js')
const typeface = require('../../utils/typeface.js')

Page({
  data: {
    bookId: '', level: 0, words: [], index: 0, total: 0,
    word: {}, flipped: false, done: false, percent: 0,
    isCustom: false,
    hand: 'right',   // 操作手：left=按钮在左侧(不认识下) right=右侧(认识下)
    cardH: 0,        // 背面内容实测高度(px)，0=使用默认高度
    faceStack: typeface.loadStack()  // 学习卡当前字体（含记忆偏好）
  },

  // 字体选择组件上抛时应用
  onFace(e) {
    this.setData({ faceStack: e.detail.stack })
  },

  onLoad(q) {
    const bookId = q.bookId
    const level = parseInt(q.level || '0')
    // 每日字体彩蛋：若当天首次学习则自动换一款字体（尊重当天手动选择）
    const surprise = typeface.dailyPick()
    const extra = surprise ? { faceStack: surprise.stack } : {}
    this.setData(Object.assign({ hand: store.getHandMode() }, extra))
    if (surprise) {
      wx.showToast({ title: `🎁 今日字体彩蛋：「${surprise.name}」，不喜欢可点 Aa 换回`, icon: 'none' })
    }
    words.ensureBook(bookId).then(() => {
      let list
      let isCustom = false
      const learned = new Set(words.getLearnedIds(bookId) || [])
      this._learnedSet = learned // 本页已学集合（重学本关时避免重复计数）
      if (q.ids) {
        // 自定义选词模式：ids=1 时读取选词页勾选的单词（学过的默认不进，除非选词页解锁）
        list = (words.getPickIds(bookId) || []).filter(id => !learned.has(id)).map(id => words.getWord(id)).filter(Boolean)
        isCustom = list.length > 0
        if (!isCustom) {
          wx.showToast({ title: '所选单词已全部学完，请重新选词', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 900)
          return
        }
      } else {
        const levelWords = words.getLevelWords(bookId, level)
        if (q.force === '1' || q.force === 1) {
          // force=1：重新学整关（词全部出现）
          list = levelWords.slice()
        } else {
          // 默认续学：本关已学过的词自动跳过，只学剩余新词，避免重复浪费时间
          list = levelWords.filter(w => !learned.has(w.id))
          const skipped = levelWords.length - list.length
          if (skipped > 0 && list.length) {
            wx.showToast({ title: `已跳过 ${skipped} 个学过的词，继续剩余新词`, icon: 'none' })
          }
        }
      }
      // 本关新词已全部学完（或整关已学过）→ 直接进「完成」页引导测验/重学
      if (!list.length && !isCustom) {
        store.saveLastPos({ bookId, level, index: 0 })
        this.setData({ bookId, level, words: [], total: 0, index: 0, word: {}, done: true, percent: 0, isCustom })
        return
      }
      if (!list.length) {
        wx.showToast({ title: '没有可学的词', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
      store.saveLastPos({ bookId, level, index: 0 })
      this.setData({
        bookId, level, words: list, total: list.length,
        word: list[0] || {}, percent: 0, isCustom
      })
    }).catch(err => {
      wx.showToast({ title: err.message || '加载词库失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    })
  },

  // 记录「继续学习」断点位置（书 + 关），供地图页一键续学
  persistPos() {
    if (this.data.isCustom) return
    store.saveLastPos({ bookId: this.data.bookId, level: this.data.level, index: this.data.index })
  },

  onHide() { this.persistPos() },

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
    this.persistPos()
    if (this.audioCtx) this.audioCtx.destroy()
    if (this.timer) clearTimeout(this.timer)
  },

  known() {
    const id = this.data.word.id
    // 主动标记为“认识” → SRS 记一次熟记(grade 5)
    store.gradeWord(id, 5)
    this.afterJudge(id)
    this.next()
  },

  notKnown() {
    const id = this.data.word.id
    // 不认识 → SRS 记一次遗忘(grade 0)，立即进入复习队列
    store.gradeWord(id, 0)
    this.afterJudge(id)
    this.next()
  },

  // 词判完后的统计落账：首次学才计入已学数（重学本关不重复累加）
  afterJudge(id) {
    const isFirst = !(this._learnedSet && this._learnedSet.has(id))
    if (isFirst) {
      store.markLearned(this.data.bookId, 1)
      if (this._learnedSet) this._learnedSet.add(id)
    }
    words.addLearned(this.data.bookId, id)
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

  // 重新学一遍本关（全部词重新出现，用于已学完/测验未过想再巩固时）
  retryStudy() {
    if (this.data.isCustom) return
    const { bookId, level } = this.data
    const list = words.getLevelWords(bookId, level)
    if (!list.length) return
    store.saveLastPos({ bookId, level, index: 0 })
    this.setData({
      done: false, words: list, total: list.length, index: 0,
      word: list[0], flipped: false, cardH: 0, percent: 0
    })
  },

  back() { wx.navigateBack() }
})
