// pages/home/home.js —— 首页：打卡 + 每日任务 + 双语阅读/玩法入口
const store = require('../../utils/store.js')
const ret = require('../../utils/retention.js')
const words = require('../../utils/wordbank.js')
const dict = require('../../utils/dict.js')
const trending = require('../../utils/trending.js')

// 常见屈折变形 → 词根候选（仅作本地词库兜底，与阅读器一致）
function guessRoot(spell) {
  const s = String(spell).toLowerCase()
  const out = []
  const add = t => { if (t && t !== s && t.length > 2 && out.indexOf(t) < 0) out.push(t) }
  if (s.length > 4 && /ies$/.test(s)) add(s.slice(0, -3) + 'y')          // cities → city
  if (s.length > 3 && s.endsWith('es')) add(s.slice(0, -2))              // buses → bus
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) add(s.slice(0, -1)) // dogs → dog
  if (s.length > 4 && s.endsWith('ed')) { add(s.slice(0, -2)); add(s.slice(0, -1)) } // played→play, liked→like
  if (s.length > 5 && s.endsWith('ing')) {
    add(s.slice(0, -3))                                                  // going → go
    add(s.slice(0, -3) + 'e')                                            // making → make
    const d = s.slice(0, -3)
    if (d.length > 2 && d.charAt(d.length - 1) === d.charAt(d.length - 2)) add(d.slice(0, -1)) // running→run
  }
  return out
}

Page({
  data: {
    level: 1, expInLevel: 0, need: 200, expPercent: 0,
    coin: 0, streak: 0, checked: false,
    dueCount: 0, retention: 100, wrongCount: 0, todayLearned: 0,
    checkinText: '今日未打卡', checkinBonus: 12,
    haveResume: false, resumeText: '', resumeSub: '',
    hotItems: [], hotShow: [], hotIdx: 0, cur: 0, hotLabel: '',
    hotAuto: true, hotAni: true, // 自动轮播标记 + 过渡是否开启；hotShow = 条目 + 首条副本(无缝循环)
    pop: null      // 点词释义浮层（与阅读器一致）
  },

  onShow() {
    this.refresh()
    this.loadHot()
    this.maybeGuide()
  },

  // 首次进入且未设置兴趣 → 引导选择（可跳过；之后「我的」页可改）
  maybeGuide() {
    try {
      if (wx.getStorageSync('interest_guided')) return
      if (store.getInterestTags().length) return
      // 先落标记再跳转：即使从引导页按返回键退出，也不会每次回来都弹
      wx.setStorageSync('interest_guided', '1')
      wx.navigateTo({ url: '/pages/interests/interests?guide=1' })
    } catch (e) {}
  },

  // 今日双语热点流（云端 → 离线兜底），按兴趣过滤后滚动展示
  loadHot() {
    trending.loadFeed().then(r => {
      const list = (r && r.items) || []
      const text = trending.interestText()
      // 热点句本身已带中文译文，点击只查句中单词，故逐词拆开渲染
      const ready = list.map(it => {
        let toks = String(it.en || '').split(/\s+/).filter(Boolean).map((w, i) => ({ i, w }))
        if (toks.length > 18) toks = toks.slice(0, 18).concat([{ i: -1, w: '…' }])
        return Object.assign({}, it, { toks })
      })
      // 无缝循环：轨道末尾补一条首项副本，滚到副本后原位复位回第 0 条
      const show = ready.length ? ready.concat([Object.assign({}, ready[0], { key: '__loop' })]) : []
      this.stopHotTimer()
      this.setData({
        hotItems: ready,
        hotShow: show,
        hotLabel: text || '为你精选',
        hotIdx: 0,
        cur: 0,
        hotAni: true
      }, () => this.startHotTimer())
    }).catch(() => {})
  },

  // ---------- 双语热点：自绘无缝轮播（原生 vertical swiper 真机自动播抖动，改用整轨 translateY） ----------
  startHotTimer() {
    this.stopHotTimer()
    if (!this.data.hotAuto || this.data.hotItems.length < 2) return
    this._hotTimer = setInterval(() => this.step(1), 3800)
  },
  stopHotTimer() {
    if (this._hotTimer) { clearInterval(this._hotTimer); this._hotTimer = null }
  },
  // 从 no-anim 复位状态恢复过渡能力后再位移，避免同帧改 class+transform 导致跳变
  ensureAni() {
    return new Promise(resolve => {
      if (this.data.hotAni) return resolve()
      this.setData({ hotAni: true }, () => setTimeout(resolve, 30))
    })
  },
  // 当前真实显示第几条（0..n-1；hotIdx===n 时显示的是首条副本）
  realCur() {
    const n = this.data.hotItems.length
    return n ? this.data.hotIdx % n : 0
  },
  // 跳一步：dir=1 切下一条，dir=-1 回上一条
  step(dir) {
    const n = this.data.hotItems.length
    if (n < 2) return
    if (this.data.hotIdx === n) { this.snapToFirst(); return }
    const to = this.data.hotIdx + dir
    if (to >= 0 && to <= n) {
      this.ensureAni().then(() => {
        this.setData({ hotIdx: to, cur: to % n })
      })
      return
    }
    if (to < 0) {
      // 从首条回退到末条：先无动画跳到副本位（内容=首条，肉眼不可见），再下滑一格露出末条
      this.snapToCopy()
      setTimeout(() => {
        this.ensureAni().then(() => this.setData({ hotIdx: n - 1, cur: n - 1 }))
      }, 40)
    }
  },
  // 跳到副本位（无动画；副本内容 = 首条，视觉上与当前重合）
  snapToCopy() {
    const n = this.data.hotItems.length
    this.setData({ hotIdx: n, cur: 0, hotAni: false })
  },
  // 副本位原位复位回第 0 条（无动画，内容相同所以肉眼无感）
  snapToFirst() {
    const n = this.data.hotItems.length
    if (n > 1) this.setData({ hotIdx: 0, cur: 0, hotAni: false })
  },
  // 每次过渡结束若落在副本位，则原位复位
  onTrackEnd() {
    const n = this.data.hotItems.length
    if (n > 1 && this.data.hotIdx === n) this.snapToFirst()
  },
  onHotDot(e) {
    const n = this.data.hotItems.length
    if (n < 2) return
    const t = Number(e.currentTarget.dataset.i) || 0
    if (t === this.realCur()) return
    this.stopHotTimer()
    this.ensureAni().then(() => {
      this.setData({ hotIdx: t, cur: t })
      if (this.data.hotAuto) this.startHotTimer()
    })
  },
  // 手指触碰即暂停自动播（方便细读当前条）；上滑/下滑切换前后条
  onHotTouchStart(e) {
    this._tY = e.touches[0].clientY
    if (this.data.hotAuto) {
      this.stopHotTimer()
      this.setData({ hotAuto: false })
    }
  },
  onHotTouchMove() { /* 阻止整页跟随卡片内手势滚动 */ },
  onHotTouchEnd(e) {
    if (this._tY == null) return
    const dy = e.changedTouches[0].clientY - this._tY
    this._tY = null
    if (Math.abs(dy) < 36) return
    this.step(dy < 0 ? 1 : -1)
  },
  toggleHotAuto() {
    if (this.data.hotAuto) {
      this.stopHotTimer()
      this.setData({ hotAuto: false })
    } else {
      this.setData({ hotAuto: true }, () => this.startHotTimer())
    }
  },
  onHide() { this.stopHotTimer() },
  onUnload() { this.stopHotTimer() },
  // ---------- 点词查义浮层（复用阅读器：本地词库 → 在线词典/翻译 → 词根兜底，可收藏生词本） ----------
  onWordTap(e) {
    const raw = e.currentTarget.dataset.w || ''
    const w = raw.replace(/[^A-Za-z’'\-]+$/g, '').trim()
    if (!w || w === '…') return
    this._tok = (this._tok || 0) + 1
    const tok = this._tok

    // ① 本地词库命中 → 秒出
    const found = words.searchBySpell(w)
    if (found) {
      this.setData({ pop: this.buildLocalPop(found) })
      return
    }

    // ② 未收录 → 先显示查词中，同时做词形猜测 + 在线词典
    this.setData({
      pop: {
        word: w, pho: '', emoji: '📖', meaning: '', sub: '',
        examples: [], loading: true, mine: '', mbox: null
      }
    })
    const root = guessRoot(w).map(x => words.searchBySpell(x)).find(Boolean) || null
    dict.lookupOnline(w).then(res => {
      if (tok !== this._tok) return // 已关浮层或点了别的词，丢弃过期结果
      if (res && res.ok) {
        this.setData({ pop: this.buildOnlinePop(w, res) })
        return
      }
      // ③ 在线不可用/查不到 → 词根命中给个参考
      if (root) {
        const p = this.buildLocalPop(root)
        p.word = w
        p.sub = '由 “' + root.spell + '” 变形而来（离线释义）'
        this.setData({ pop: p })
        return
      }
      this.setData({
        pop: {
          word: w, pho: '', emoji: '🔍',
          meaning: '本地词库与在线词典都没查到这个词。',
          sub: '离线场景可先结合上下文猜词义；联网并部署 dict 云函数后即可查到任意生词。',
          examples: [], loading: false, mine: 'err', mbox: null
        }
      })
    })
  },

  // 本地词条 → 浮层
  buildLocalPop(f) {
    const ex = f.example ? [{ en: f.example, zh: f.exampleZh || '' }] : []
    return {
      word: f.spell,
      pho: f.phonetic || '',
      emoji: f.emoji || '🔤',
      meaning: f.meaning || '',
      sub: f.root ? '词根：' + f.root : '',
      examples: ex,
      loading: false,
      mine: words.hasMyboxWord(f.spell) ? 'in' : 'local', // 词库已收录，无需重复收藏
      mbox: { phonetic: f.phonetic || '', meaning: f.meaning || '', example: f.example || '', exampleZh: f.exampleZh || '' }
    }
  },

  // 在线词典 / 翻译结果 → 浮层
  buildOnlinePop(w, res) {
    if (res.mode === 'translate') {
      const translated = String(res.translated || '').trim()
      const spell = w.toLowerCase()
      return {
        word: w,
        pho: '', emoji: '🔤',
        meaning: translated || '（在线翻译未返回结果）',
        sub: '在线译文（大意）',
        examples: [], loading: false,
        mine: words.hasMyboxWord(spell) ? 'in' : 'none',
        mbox: { phonetic: '', meaning: translated, example: '', exampleZh: '' }
      }
    }
    // mode === 'dict'
    const us = res.usPhonetic ? ('美 /' + res.usPhonetic + '/') : ''
    const uk = res.ukPhonetic ? ('英 /' + res.ukPhonetic + '/') : ''
    const pho = [us, uk].filter(Boolean).join('  ')
    const senses = (res.senses || []).slice(0, 5)
    const exs = (res.examples || []).slice(0, 2).map(x => ({ en: x.en || '', zh: x.zh || '' }))
    const spell = String(res.word || w).toLowerCase()
    return {
      word: res.word || w,
      pho, emoji: '📘',
      meaning: senses.join('；') || '（未返回释义）',
      sub: '来自 ' + (res.source || '在线词典'),
      examples: exs,
      loading: false,
      mine: words.hasMyboxWord(spell) ? 'in' : 'none',
      mbox: {
        phonetic: pho,
        meaning: (res.senses || []).slice(0, 2).join('；'),
        example: exs[0] ? exs[0].en : '',
        exampleZh: exs[0] ? exs[0].zh : ''
      }
    }
  },

  // 收藏 / 移出生词本
  toggleBox() {
    const pop = this.data.pop
    if (!pop || pop.loading || !pop.word || !pop.mbox) return
    if (pop.mine === 'in') {
      words.removeMyboxWord(pop.word)
      this.setData({ 'pop.mine': 'none' })
      wx.showToast({ title: '已移出生词本', icon: 'none' })
      return
    }
    if (pop.mine !== 'none') return
    const mb = pop.mbox
    const r = words.addMyboxWord({
      spell: pop.word,
      phonetic: mb.phonetic || '',
      meaning: mb.meaning || pop.meaning || '',
      example: mb.example || '',
      exampleZh: mb.exampleZh || ''
    })
    if (r && r.ok) {
      this.setData({ 'pop.mine': 'in' })
      wx.showToast({ title: '⭐ 已加入我的生词本', icon: 'none' })
    } else if (r && r.exists) {
      this.setData({ 'pop.mine': 'in' })
      wx.showToast({ title: '这个单词已在生词本里啦', icon: 'none' })
    } else {
      wx.showToast({ title: '收藏失败，请重试', icon: 'none' })
    }
  },

  // 发音（有道 TTS，网页可访问不依赖合法域名）
  speak(e) {
    const w = e.currentTarget.dataset.w || this.data.pop.word
    if (!w) return
    if (this.audioCtx) this.audioCtx.destroy()
    const audio = wx.createInnerAudioContext()
    this.audioCtx = audio
    audio.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=1'
    audio.play()
    audio.onError(() => wx.showToast({ title: '发音加载失败，请检查网络', icon: 'none' }))
  },

  closePop() {
    this._tok = (this._tok || 0) + 1 // 使在途查询结果失效
    if (this.audioCtx) { this.audioCtx.destroy(); this.audioCtx = null }
    this.setData({ pop: null })
  },
  noop() {},
  goInterests() { wx.navigateTo({ url: '/pages/interests/interests' }) },

  refresh() {
    const p = store.getProfile()
    const expInLevel = p.exp % 200
    const need = 200
    const dueIds = store.getDueWordIds()
    const due = dueIds.length
    const all = wx.getStorageSync('srs_state') || {}
    const learned = Object.keys(all).length
    const retention = learned === 0 ? 100 : Math.round(ret.overallRetention(all, Date.now()) * 100)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const checked = p.lastCheckin && new Date(p.lastCheckin).setHours(0, 0, 0, 0) === today.getTime()
    // 「继续学习」断点 → 主按钮文案
    let haveResume = false
    let resumeText = ''
    let resumeSub = ''
    const pos = store.loadLastPos()
    if (pos && words.isDownloaded(pos.bookId)) {
      const book = words.getBooks().find(b => b.bookId === pos.bookId)
      if (book) {
        haveResume = true
        const maxLv = Math.max(1, words.getLevelCount(pos.bookId))
        const next = Math.min(pos.level + 1, maxLv)
        resumeText = book.name
        resumeSub = `上次学到第 ${next} 关，接着学`
      }
    }
    this.setData({
      level: p.level, expInLevel, need, expPercent: Math.round(expInLevel / need * 100),
      coin: p.coin, streak: p.streak, checked,
      dueCount: due, retention: Math.max(0, Math.min(100, retention)),
      wrongCount: store.getWrongWordIds().length,
      todayLearned: store.getTodayLearned(),
      checkinText: checked ? '今日已打卡 ✅' : '点击完成今日打卡',
      checkinBonus: (p.streak + 1) * 2 + 10,
      haveResume, resumeText, resumeSub
    })
  },

  onCheckIn() {
    const res = store.checkIn()
    if (!res.ok) { wx.showToast({ title: '今天已打卡', icon: 'none' }); this.refresh(); return }
    wx.showToast({ title: '打卡 +' + ((res.streak) * 2 + 10) + ' 连续' + res.streak + '天', icon: 'none' })
    this.refresh()
  },

  goSearch() { wx.navigateTo({ url: '/pages/search/search' }) },
  goBooks() { wx.switchTab({ url: '/pages/books/books' }) },
  goStore() { wx.navigateTo({ url: '/pages/bookstore/bookstore' }) },
  goLibrary() { wx.navigateTo({ url: '/pages/library/library' }) },
  goMistakes() { wx.navigateTo({ url: '/pages/mistakes/mistakes' }) },
  goCurve() { wx.navigateTo({ url: '/pages/curve/curve' }) },
  goPK() { wx.navigateTo({ url: '/pages/pkroom/pkroom?bookId=daily&level=0' }) },
  goRank() { wx.navigateTo({ url: '/pages/rank/rank' }) },
  goFriend() { wx.navigateTo({ url: '/pages/friend/friend' }) },
  goClass() { wx.navigateTo({ url: '/pages/class/class' }) },
  goMap() { wx.switchTab({ url: '/pages/map/map' }) },
  goReview() {
    if (this.data.dueCount === 0) { wx.showToast({ title: '暂无到期词', icon: 'none' }); return }
    wx.navigateTo({ url: '/pages/review/review' })
  }
})
