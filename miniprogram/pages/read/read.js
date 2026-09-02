// pages/read/read.js —— 双语阅读器：中英对照 / 只英 / 只中 + 字号 + 点词查义 + 进度记忆
const novels = require('../../utils/novels.js')
const words = require('../../utils/wordbank.js')
const dict = require('../../utils/dict.js')
const typeface = require('../../utils/typeface.js')

// 常见屈折变形 → 词根候选（仅作本地词库兜底，如 rabbits→rabbit / went 查不到时不强求）
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

const FS_KEY = 'reading_font_size'
const FONTS = typeface.FONTS

Page({
  data: {
    novelId: '',
    chapters: [],        // 全部章节 {seq,title}
    segs: [],            // 当前章段 [{en,zh,toks}]
    seq: 0,
    mode: 'dual',        // en | dual | zh
    fontSize: 18,
    fonts: FONTS,
    fontFamily: FONTS[0].stack,
    showFonts: false,    // 字体选择面板
    pop: null,           // 点词释义浮层
    loading: true
  },

  onLoad(q) {
    const novelId = q.novelId || ''
    let fontSize = 18
    try { fontSize = Number(wx.getStorageSync(FS_KEY)) || 18 } catch (e) {}
    this.setData({ novelId, fontSize, fontFamily: typeface.loadStack() })
    novels.openBook(novelId).then(chapters => {
      const book = novels.getBooks().find(b => b.novelId === novelId)
      if (book) wx.setNavigationBarTitle({ title: book.title })
      // 恢复上次进度
      let seq = 0
      try { const pr = wx.getStorageSync('reading_progress_' + novelId); if (pr) seq = pr.seq || 0 } catch (e) {}
      if (seq >= chapters.length) seq = 0
      this.setData({ chapters, seq })
      // 全本无中文段（如纯英文原版整书）→ 自动锁定英文模式，隐藏「中文」按钮
      const enOnly = chapters.every(ch => (ch.segments || []).every(s => !(s.zh || '').trim()))
      if (enOnly) this.setData({ enOnly: true, mode: 'en' })
      this.applyChapter(seq, true)
      this.setData({ loading: false })
    }).catch(err => {
      wx.showToast({ title: err.message || '打开失败', icon: 'none' })
      this.setData({ loading: false })
      setTimeout(() => wx.navigateBack(), 900)
    })
  },

  // 切章渲染 + 存档进度
  applyChapter(seq, silent) {
    const ch = this.data.chapters[seq]
    if (!ch) return
    const segs = (ch.segments || []).map(s => ({
      en: s.en,
      zh: s.zh,
      toks: (s.en || '').split(/\s+/).filter(Boolean).map((w, i) => ({ i, w })) // 保留原大小写/标点
    }))
    this.setData({ seq, segs })
    if (!silent) this.saveProgress(seq)
  },

  saveProgress(seq) {
    try { wx.setStorageSync('reading_progress_' + this.data.novelId, { seq }) } catch (e) {}
  },

  onHide() { this.saveProgress(this.data.seq) },
  onUnload() { this.saveProgress(this.data.seq) },

  goCh(e) {
    const i = Number(e.currentTarget.dataset.i)
    if (i === this.data.seq) return
    this.applyChapter(i, false)
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  prevCh() {
    if (this.data.seq <= 0) { wx.showToast({ title: '已是第一章', icon: 'none' }); return }
    this.applyChapter(this.data.seq - 1, false)
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  nextCh() {
    if (this.data.seq >= this.data.chapters.length - 1) {
      wx.showToast({ title: '已经是最后一章啦 🎉', icon: 'none' })
      return
    }
    this.applyChapter(this.data.seq + 1, false)
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.m })
  },
  fontDec() {
    const v = Math.max(15, this.data.fontSize - 1)
    this.applyFont(v)
  },
  fontInc() {
    const v = Math.min(26, this.data.fontSize + 1)
    this.applyFont(v)
  },
  applyFont(v) {
    this.setData({ fontSize: v })
    try { wx.setStorageSync(FS_KEY, v) } catch (e) {}
  },

  openFonts() { this.setData({ showFonts: true }) },
  closeFonts() { this.setData({ showFonts: false }) },
  pickFont(e) {
    const stack = e.currentTarget.dataset.stack
    const f = this.data.fonts.find(x => x.stack === stack)
    this.setData({ fontFamily: stack, showFonts: false })
    if (f) typeface.saveById(f.id)
  },

  // ---------- 点词查义（三级：本地词库 → 在线词典/翻译 → 变形词根兜底） ----------
  tapWord(e) {
    const raw = e.currentTarget.dataset.w || ''
    const w = raw.replace(/[^A-Za-z’'\-]+$/g, '')
    if (!w) return
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
          word: w, pho: '', emoji: '🔍', meaning: '本地词库与在线词典都没查到这个词。',
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

  // 收藏 / 移出生词本（字段与内置词库兼容，收藏后即可走正常学习流程）
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
  noop() {}
})
