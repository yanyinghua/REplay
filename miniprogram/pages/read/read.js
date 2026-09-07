// pages/read/read.js —— 双语阅读器：中英对照 / 只英 / 只中 + 字号 + 点词查义 + 进度记忆
const novels = require('../../utils/novels.js')
const words = require('../../utils/wordbank.js')
const dict = require('../../utils/dict.js')
const typeface = require('../../utils/typeface.js')
const tts = require('../../utils/speak.js')

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

// 中文段落按句切分（朗读悬浮译文用段内中文做近似匹配）
function splitZh(t) {
  return (String(t || '').match(/[^。！？!?…；;]+[。！？!?…；;]?/g) || []).map(x => x.trim()).filter(Boolean)
}

// ---------- 句子切分 ----------
// 英文：按词划分句子，句终标点 . ! ?（引号收尾也认），常见缩写/省略号不切断
const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'mt', 'vs', 'jr', 'sr',
  'inc', 'ltd', 'corp', 'co', 'fig', 'ref', 'approx', 'dept', 'no',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'u.s', 'u.k', 'a.m', 'p.m', 'e.g', 'i.e', 'etc', 'est'])
function groupEnSentences(en) {
  const toks = String(en || '').split(/\s+/).filter(Boolean).map((w, i) => ({ i, w }))
  const out = []
  let cur = []
  const flush = () => {
    if (cur.length) {
      out.push({ si: out.length, text: cur.map(t => t.w).join(' '), toks: cur })
      cur = []
    }
  }
  for (let k = 0; k < toks.length; k++) {
    const w = toks[k].w
    cur.push(toks[k])
    // 取句末可能带引号的标点
    let last = w.charAt(w.length - 1)
    if (/[”"''’]/.test(last)) last = w.charAt(w.length - 2) || ''
    if (!/[.!?]/.test(last)) continue
    let isEnd = true
    if (last === '.') {
      if (w.indexOf('…') >= 0 || w.indexOf('...') >= 0) {
        // 省略号：仅当它就是本句末尾才结束
        isEnd = k === toks.length - 1
      } else {
        const body = String(w).replace(/[.”"'']+$/g, '')
        const lower = body.toLowerCase()
        // Mr. / e.g. / U.S. 之类缩写或单字母，不当作句末
        if ((/^[a-z]+$/.test(lower) && (ABBR.has(lower) || body.length === 1)) ||
            (/^[a-z]\.[a-z]+$/.test(lower) && ABBR.has(lower))) isEnd = false
      }
    }
    if (isEnd) flush()
  }
  flush()
  return out
}



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
    sel: null,           // 选中的句子 {segi,si,zh,text}
    sPop: null,          // 句子翻译结果浮层 {text,zh,label}
    trLoading: false,    // 句子翻译进行中
    loading: true,
    aloud: null,         // 整章朗读控制条 {playing,cur,total,text,rate}
    follow: true,        // 朗读时是否自动滚动跟随高亮句
    cont: false,         // 是否连续朗读（本章读完自动接下一章）
    alTr: null           // 朗读译文悬浮框 {open,show,x,y,w,en,zh,src}
  },

  onLoad(q) {
    const novelId = q.novelId || ''
    let fontSize = 18
    try { fontSize = Number(wx.getStorageSync(FS_KEY)) || 18 } catch (e) {}
    this.setData({ novelId, fontSize, fontFamily: typeface.loadStack() })
    novels.openBook(novelId).then(chapters => {
      const book = novels.getBooks().find(b => b.novelId === novelId)
      if (book) wx.setNavigationBarTitle({ title: book.title })
      // 恢复上次进度（章节 + 章内滚动位置）
      let seq = 0
      let resumeTop = 0
      try {
        const pr = wx.getStorageSync('reading_progress_' + novelId)
        if (pr) {
          seq = Number(pr.seq) || 0
          resumeTop = Number(pr.top) || 0
        }
      } catch (e) {}
      if (seq >= chapters.length) seq = 0
      this.setData({ chapters, seq })
      // 全本无中文段（如纯英文原版整书）→ 自动锁定英文模式，隐藏「中文」按钮
      const enOnly = chapters.every(ch => (ch.segments || []).every(s => !(s.zh || '').trim()))
      if (enOnly) this.setData({ enOnly: true, mode: 'en' })
      this.applyChapter(seq, true)
      this.setData({ loading: false }, () => this.restorePosition(resumeTop))
      this.guideTip()
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
    if (this._contTimer) { clearTimeout(this._contTimer); this._contTimer = null } // 手动切章 → 取消连读排队
    if (this.data.aloud) { tts.stop(); this._aloudItems = null; this.hideAlTr(); this.setData({ aloud: null }) } // 切章时结束整章朗读
    let g = 0 // 句在整章内的全局序号（供朗读高亮/定位）
    const segs = (ch.segments || []).map(s => ({
      en: s.en,
      zh: s.zh,
      sls: groupEnSentences(s.en).map(x => { x.g = g++; return x }) // 英文句：保留逐词 token，可点词/长按选句
    }))
    this._lastTop = 0 // 新章节从顶部开始计位
    this.setData({ seq, segs, sel: null, sPop: null, trLoading: false })
    if (!silent) this.saveProgress(seq, 0)
  },

  // ---------- 阅读进度记忆：章节 + 章内滚动位置 ----------
  saveProgress(seq, top) {
    const novelId = this.data.novelId
    if (!novelId) return
    let rec = {}
    try { rec = wx.getStorageSync('reading_progress_' + novelId) || {} } catch (e) {}
    rec.seq = seq
    if (typeof top === 'number') rec.top = Math.round(top)
    rec.ts = Date.now()
    try { wx.setStorageSync('reading_progress_' + novelId, rec) } catch (e) {}
  },

  // 页面滚动 → 节流落盘（约 1s 一次），杀进程/切后台也不易丢
  onPageScroll(e) {
    const t = e.scrollTop || 0
    this._lastTop = t
    if (this._restoring || this._progTimer) return
    this._progTimer = setTimeout(() => {
      this._progTimer = null
      this.saveProgress(this.data.seq, this._lastTop || 0)
    }, 900)
  },

  flushProgress() {
    if (this._progTimer) { clearTimeout(this._progTimer); this._progTimer = null }
    this.saveProgress(this.data.seq, this._lastTop || 0)
  },

  onHide() { this.flushProgress() },
  onUnload() {
    this._gone = true // 防止异步朗读回调在页面卸载后误操作
    this.flushProgress()
    if (this._contTimer) { clearTimeout(this._contTimer); this._contTimer = null }
    tts.stop() // 离开阅读页时停掉朗读
  },

  // 章节渲染完成后，把页面滚回上次阅读位置（大章节分两次校准）
  restorePosition(top) {
    if (!top || top <= 0) { this._restoring = false; return }
    this._restoring = true
    const doScroll = () => wx.pageScrollTo({ scrollTop: top, duration: 0 })
    setTimeout(doScroll, 300)
    setTimeout(doScroll, 900)
    setTimeout(() => { this._restoring = false }, 1500)
  },

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

  // ---------- 整章朗读：顺序朗读本章全部英文句，逐句推进可暂停/拖进度 ----------
  toggleAloud() {
    if (this.data.aloud) this.stopAloud()
    else this.startAloud()
  },
  startAloud() {
    if (this._gone) return
    if (this._contTimer) { clearTimeout(this._contTimer); this._contTimer = null } // 手动重新开读 → 取消连读排队
    const items = []
    this.data.segs.forEach((seg, gi) => {
      ;(seg.sls || []).forEach((sl, si) => {
        if (sl.text) items.push({ text: sl.text, meta: { gi, si } }) // meta 记录所在段/句，供悬浮译文取本段中文
      })
    })
    if (!items.length) {
      wx.showToast({ title: '本章没有可朗读的句子', icon: 'none' })
      return
    }
    this._aloudItems = items // 供拖动进度预览句子、悬浮译文同步用
    // 朗读偏好记忆：语速 / 是否自动跟随 / 是否连续读下一章（跨会话持久化）
    let rate = 1
    let follow = true
    let cont = false
    try {
      rate = Number(wx.getStorageSync('read_aloud_rate')) || 1
      follow = wx.getStorageSync('read_aloud_follow') !== 0
      cont = wx.getStorageSync('read_aloud_cont') === 1
    } catch (e) {}
    this._aloudRate = rate
    this._follow = follow
    this._cont = cont
    this.setData({
      aloud: { playing: true, cur: 0, total: items.length, text: items[0].text, rate: this._aloudRate },
      follow, cont,
      alTr: this.buildAlTr(), // 按上次偏好/位置恢复悬浮译文框（开则显示）
      sel: null, pop: null, sPop: null
    })
    tts.playChapter(items, {
      onItem: (info) => {
        if (this._gone || !this.data.aloud) return
        this.setData({
          aloud: { playing: info.playing, cur: info.idx, total: info.total, text: info.text, rate: this._aloudRate }
        }, () => {
          if (this._follow && this.data.aloud) this.scrollToCur(info.idx)
        })
        this.alTrSync(info)
      },
      onDone: () => {
        if (this._gone) return
        this.hideAlTr()
        this.setData({ aloud: null })
        const chs = this.data.chapters || []
        const nx = this.data.seq + 1
        if (this._cont && nx < chs.length) {
          // 连读：自动切入下一章并继续朗读（进度随 applyChapter 记录）
          wx.showToast({ title: '本章完成，自动续读下一章', icon: 'none' })
          this.applyChapter(nx, false)
          this._contTimer = setTimeout(() => { this._contTimer = null; this.startAloud() }, 320)
        } else {
          wx.showToast({ title: '本章朗读完成 🎉', icon: 'none' })
        }
      }
    })
  },
  // 朗读中轻点正文某句的空白/标点处 → 从该句开始续读（点单词仍是查词）
  tapLineAloud(e) {
    const a = this.data.aloud
    if (!a) return
    if (this._selAt && Date.now() - this._selAt < 600) return // 长按选句抬起紧随的 tap 忽略
    const g = Number(e.currentTarget.dataset.g)
    const n = Math.max(0, Math.min(a.total - 1, isNaN(g) ? a.cur : g))
    const it = this._aloudItems && this._aloudItems[n]
    const same = n === a.cur
    if (same && a.playing) return // 正在播这一句，无事可做
    if (a.playing) {
      // 播放中点击别的句子 → 直接跳过去播
      tts.chapterSeek(n)
    } else if (same) {
      // 暂停中点击当前句 → 直接续播（不重载音频）
      tts.chapterResume()
    } else {
      // 暂停中点别的句子 → 跳到该句并继续播放
      tts.chapterSeek(n)
      tts.chapterResume()
    }
    this.setData({
      'aloud.cur': n,
      'aloud.text': (it && it.text) || a.text,
      'aloud.playing': true
    })
    if (this._follow) this.scrollToCur(n)
    this.alTrSyncFromIdx(n)
  },
  // 连续朗读开关：本章读完自动接下一章
  aloudCont() {
    this._cont = !this._cont
    this.setData({ cont: this._cont })
    try { wx.setStorageSync('read_aloud_cont', this._cont ? 1 : 0) } catch (e) {}
    wx.showToast({ title: this._cont ? '连读已开：读完自动续下章' : '连读已关', icon: 'none' })
  },
  // 播放 / 暂停切换
  aloudToggle() {
    const a = this.data.aloud
    if (!a) return
    if (a.playing) { tts.chapterPause(); this.setData({ 'aloud.playing': false }) }
    else { tts.chapterResume(); this.setData({ 'aloud.playing': true }) }
  },
  // 上/下一句：跳到相邻句播放（暂停状态下跳到该句等待）
  aloudStep(e) {
    const a = this.data.aloud
    if (!a) return
    const d = Number(e.currentTarget.dataset.d)
    const n = Math.max(0, Math.min(a.total - 1, a.cur + d))
    if (n === a.cur) return
    tts.chapterSeek(n)
    this.setData({ 'aloud.cur': n })
  },
  // 倍速循环：1× → 1.25× → 1.5× → 2× → 0.75× → 回到 1×
  aloudRate() {
    const rates = [1, 1.25, 1.5, 2, 0.75]
    const i = rates.indexOf(this._aloudRate || 1)
    this._aloudRate = rates[(i + 1) % rates.length]
    tts.setChapterRate(this._aloudRate)
    try { wx.setStorageSync('read_aloud_rate', this._aloudRate) } catch (e) {}
    this.setData({ 'aloud.rate': this._aloudRate })
  },
  // 进度条拖动过程：预览该位置句子 + 高亮跟手；松手(bindchange)才真正跳句播放
  aloudDrag(e) {
    const a = this.data.aloud
    if (!a) return
    const v = Math.max(0, Math.min(a.total - 1, Number(e.detail.value) || 0))
    const it = this._aloudItems && this._aloudItems[v]
    const t = (it && it.text) || a.text
    if (v === a.cur && t === a.text) return
    this.setData({ 'aloud.cur': v, 'aloud.text': t })
  },
  // 进度条拖动到某句 → 跳到该句播放
  aloudSeek(e) {
    tts.chapterSeek(Number(e.detail.value))
  },
  // 是否让页面跟随朗读自动滚动
  aloudFollow() {
    this._follow = !this._follow
    this.setData({ follow: this._follow })
    try { wx.setStorageSync('read_aloud_follow', this._follow ? 1 : 0) } catch (e) {}
    if (this._follow && this.data.aloud) this.scrollToCur(this.data.aloud.cur)
  },
  stopAloud() {
    tts.stop()
    this._aloudItems = null
    this.hideAlTr()
    this.setData({ aloud: null })
  },

  // ---------- 朗读译文悬浮框：开关 / 内容随句滚动 / 拖拽移动 ----------
  hideAlTr() {
    const f = this.data.alTr
    if (f && f.show) this.setData({ 'alTr.show': false })
  },
  // 朗读中开关悬浮译文框（控制条「译」按钮）
  toggleAlTr() {
    const a = this.data.aloud
    if (!a) return
    const f = this.data.alTr || this.buildAlTr()
    const open = !f.open
    const next = Object.assign({}, f, { open, show: open })
    this.saveAlTrCfg(next)
    this.setData({ alTr: next })
    if (open) this.alTrSyncFromIdx(a.cur)
  },
  closeAlTr() {
    const f = this.data.alTr
    if (!f) return
    const next = Object.assign({}, f, { open: false, show: false })
    this.saveAlTrCfg(next)
    this.setData({ alTr: next })
  },
  buildAlTr() {
    let cfg = {}
    try { cfg = wx.getStorageSync('read_altr_cfg') || {} } catch (e) {}
    const win = wx.getWindowInfo ? wx.getWindowInfo() : { windowWidth: 375, windowHeight: 667 }
    const winW = win.windowWidth || 375
    const winH = win.windowHeight || 667
    const w = Math.max(230, Math.min(winW - 32, 400)) // 悬浮卡片宽
    const x = (typeof cfg.x === 'number' && cfg.x + w <= winW) ? cfg.x : Math.round((winW - w) / 2)
    const y = (typeof cfg.y === 'number' && cfg.y <= winH - 190) ? cfg.y : Math.round(winH * 0.3)
    return { open: !!cfg.open, show: !!cfg.open, x, y, w, en: '', zh: '', src: '' }
  },
  saveAlTrCfg(f) {
    try { wx.setStorageSync('read_altr_cfg', { x: f.x, y: f.y, open: f.open }) } catch (e) {}
  },
  // 朗读推进/跳句 → 悬浮译文跟句刷新；优先缓存，否则段内对照近似 + 后台取精确译文
  alTrSync(info) {
    const f = this.data.alTr
    if (!f || !f.show || !info || !info.text) return
    const en = info.text
    const cached = this.trCache()[en]
    const zh = cached || this.locZhOf(info.meta)
    this.setData({
      'alTr.en': en,
      'alTr.zh': zh || '（本句暂无译文）',
      'alTr.src': cached ? '在线译文' : '段对照(近似)'
    })
    if (!cached) this.fetchAlTr(en)
  },
  alTrSyncFromIdx(i) {
    const it = this._aloudItems && this._aloudItems[i]
    if (it) this.alTrSync({ text: it.text, meta: it.meta, playing: true })
  },
  // 用「所在段的中文整段」按句序近似取第 N 句（与长按句子的离线兜底一致）
  locZhOf(meta) {
    if (!meta) return ''
    const seg = this.data.segs[meta.gi]
    if (!seg) return ''
    const parts = splitZh(seg.zh)
    if (!parts.length) return seg.zh || ''
    return parts[Math.min(meta.si || 0, parts.length - 1)]
  },
  // 句子 → 精确在线译文缓存（Map 落地到本地，重复句子不重复请求）
  trCache() {
    if (!this._trCacheData) {
      try { this._trCacheData = wx.getStorageSync('read_altr_cache') || {} } catch (e) { this._trCacheData = {} }
    }
    return this._trCacheData
  },
  fetchAlTr(en) {
    if (!en) return
    this._alTrTok = (this._alTrTok || 0) + 1
    const tok = this._alTrTok
    dict.lookupOnline(en).then(res => {
      if (tok !== this._alTrTok) return // 朗读已切到别的句子
      if (!(res && res.ok && res.translated)) return
      const zh = String(res.translated).trim()
      if (!zh) return
      const cache = this.trCache()
      cache[en] = zh
      if (Object.keys(cache).length > 400) {
        this._trCacheData = {} // 防无限膨胀：超限清空重建
        try { wx.setStorageSync('read_altr_cache', {}) } catch (e) {}
      } else {
        try { wx.setStorageSync('read_altr_cache', cache) } catch (e) {}
      }
      const f = this.data.alTr
      if (f && f.show && f.en === en) this.setData({ 'alTr.zh': zh, 'alTr.src': '在线译文' })
    }).catch(() => {})
  },
  // 拖拽悬浮框（catch 掉 move 避免正文跟着滚）
  alTrDown(e) {
    const f = this.data.alTr
    if (!f || !e.touches) return
    const t = e.touches[0]
    this._trDrag = { sx: t.clientX, sy: t.clientY, x: f.x, y: f.y }
  },
  alTrMove(e) {
    const d = this._trDrag
    const f = this.data.alTr
    if (!d || !f || !e.touches) return
    const t = e.touches[0]
    const win = wx.getWindowInfo ? wx.getWindowInfo() : { windowWidth: 375, windowHeight: 667 }
    const winW = win.windowWidth || 375
    const winH = win.windowHeight || 667
    const nx = Math.max(4, Math.min(winW - f.w - 4, d.x + t.clientX - d.sx))
    const ny = Math.max(96, Math.min(winH - 190, d.y + t.clientY - d.sy))
    if (nx !== f.x || ny !== f.y) this.setData({ 'alTr.x': nx, 'alTr.y': ny })
  },
  alTrEnd() {
    if (!this._trDrag) return
    this._trDrag = null
    const f = this.data.alTr
    if (f) this.saveAlTrCfg(f)
  },
  // 把正在朗读的句子滚到屏幕约 1/3 高处
  scrollToCur(i) {
    const q = wx.createSelectorQuery().in(this)
    q.select('#sg-' + i).boundingClientRect()
    q.selectViewport().scrollOffset()
    q.exec(res => {
      const rect = res && res[0]
      const off = res && res[1]
      if (!rect || rect.top == null || !off) return
      const winH = (wx.getWindowInfo ? wx.getWindowInfo() : { windowHeight: 600 }).windowHeight || 600
      wx.pageScrollTo({ scrollTop: Math.max(0, off.scrollTop + rect.top - winH * 0.32), duration: 220 })
    })
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
    // 长按选句抬起后紧随的 tap 会误触到这里：短时间内忽略
    if (this._selAt && Date.now() - this._selAt < 500) return
    const d = e.currentTarget.dataset
    const raw = String(d.w || '')
    const sel = this.data.sel
    const segi = Number(d.segi)
    const si = Number(d.si)
    const idx = Number(d.i)

    // —— 句内局部选词：在当前选中的句子上点词 = 依次设定 起点词 / 终点词（不触发查词）——
    if (sel && !sel.zh && sel.segi === segi && sel.si === si && (sel.locStep || sel.loc)) {
      const sl = this.data.segs[segi] && this.data.segs[segi].sls[si]
      const toks = (sl && sl.toks) || []
      if (!sel.locStep && sel.loc) {
        // 已有选区：点任意词作为新起点，再点一个词完成重选
        this.setData({ sel: Object.assign({}, sel, { loc: { a: idx, b: idx }, locStep: 2 }) })
        return
      }
      if (sel.locStep === 1) {
        // 第 1 击：确定起点词
        this.setData({ sel: Object.assign({}, sel, { loc: { a: idx, b: idx }, locStep: 2 }) })
        return
      }
      if (sel.locStep === 2 && sel.loc) {
        // 第 2 击：确定终点词，两点之间（含）即局部选区
        const a = Math.min(sel.loc.a, idx)
        const b = Math.max(sel.loc.b, idx)
        const text = toks.slice(a, b + 1).map(t => t.w).join(' ')
        this.setData({ sel: Object.assign({}, sel, { loc: { a, b }, locStep: 0, text: text || sel.text }) })
        return
      }
      return
    }

    // 普通点词查义（原逻辑）
    const w = raw.replace(/[^A-Za-z’'\-]+$/g, '')
    if (!w) return
    this._tok = (this._tok || 0) + 1
    const tok = this._tok
    // 进入点词模式时收起句子选择
    this.setData({ sel: null, sPop: null })

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

  // 发音（统一 TTS：自动重试 + 多音源兜底，中文/英文自动选择）
  speak(e) {
    const w = e.currentTarget.dataset.w || this.data.pop.word
    if (!w) return
    if (this.data.aloud) this.stopAloud() // 单词发音会结束整章朗读
    tts.playText(w)
  },

  closePop() {
    this._tok = (this._tok || 0) + 1 // 使在途查询结果失效
    this.setData({ pop: null })
  },

  // ---------- 句子选择 / 复制 / 翻译 ----------
  // 长按任意句子（英文句或中文对照句）→ 高亮并弹出操作条
  pickSentence(e) {
    const d = e.currentTarget.dataset
    if (d.text == null) return
    this._tok = (this._tok || 0) + 1 // 作废在途查词
    this._selAt = Date.now() // 防止长按抬手的 tap 冒泡立刻清除
    this.setData({
      pop: null,
      sPop: null,
      sel: { segi: Number(d.segi), si: Number(d.si), zh: !!d.zh, text: String(d.text), loc: null, locStep: 0 }
    })
  },

  // 整句 ↔ 句内局部选词的切换（操作条上的 ✂️ 选词 / ⇄ 重选 / ✕ 取消）
  locSelect() {
    const sel = this.data.sel
    if (!sel || sel.zh) return
    const sl = this.data.segs[sel.segi] && this.data.segs[sel.segi].sls[sel.si]
    const full = (sl && sl.text) || sel.text
    if (sel.loc && !sel.locStep) {
      // 已有局部选区 → 重新开始选词
      this.setData({ sel: Object.assign({}, sel, { loc: null, locStep: 1, text: full }) })
      return
    }
    if (sel.locStep) {
      // 选词进行中 → 取消，回到整句
      this.setData({ sel: Object.assign({}, sel, { loc: null, locStep: 0, text: full }) })
      return
    }
    // 整句 → 进入句内选词（等待轻点起点词）
    this.setData({ sel: Object.assign({}, sel, { loc: null, locStep: 1 }) })
  },

  clearSel() {
    this._trTok = (this._trTok || 0) + 1 // 作废在途翻译
    this.setData({ sel: null, trLoading: false })
  },

  // 点击正文空白处（词/句子之外）取消句子高亮
  bodyTap() {
    if (this._selAt && Date.now() - this._selAt < 400) return // 长按的触摸抬起冒泡
    this.setData({ sel: null })
  },

  copySentence() {
    const sel = this.data.sel
    const t = sel && sel.text
    if (!t) return
    const part = !!(sel.loc && !sel.locStep)
    wx.setClipboardData({
      data: t,
      success: () => wx.showToast({ title: part ? '已复制所选内容' : '已复制原句', icon: 'success' })
    })
  },

  // 朗读选中的整句（自动按中/英文选音源，失败自动重试并切换备用源）
  speakSel() {
    const t = this.data.sel && this.data.sel.text
    if (!t) return
    if (this.data.aloud) this.stopAloud() // 单句朗读会结束整章朗读
    tts.playText(t)
  },

  // 在线翻译当前句子（dict 云函数：英文句→中文；中文句→英文）
  // 在线不可用时会用本段已有的中英文对照兜底，保证能给出译文
  trSentence() {
    const sel = this.data.sel
    if (!sel || this.data.trLoading) return
    this._trTok = (this._trTok || 0) + 1
    const tok = this._trTok
    this.setData({ trLoading: true })
    dict.lookupOnline(sel.text).then(res => {
      if (tok !== this._trTok) return
      this.setData({ trLoading: false })
      if (res && res.ok && res.translated) {
        this.setData({
          sel: null,
          sPop: {
            text: sel.text,
            zh: String(res.translated).trim(),
            label: sel.zh ? '中 → 英' : '英 → 中'
          }
        })
        return
      }
      // 在线失败 → 展示本段对照译文
      const zh = this.fallbackTrans(sel)
      if (zh) {
        const part = !!(sel.loc && !sel.locStep)
        this.setData({
          sel: null,
          sPop: {
            text: sel.text,
            zh,
            label: sel.zh ? '本段英文（参考）' : (part ? '本段中文对照（整句参考）' : '本段中文对照（参考）')
          }
        })
        return
      }
      wx.showToast({ title: '此句暂无离线译文，可切到「中英对照」看整段', icon: 'none' })
    }).catch(() => {
      if (tok !== this._trTok) return
      this.setData({ trLoading: false })
      wx.showToast({ title: '此句暂无离线译文，可切到「中英对照」看整段', icon: 'none' })
    })
  },

  // 离线兜底：中文段 → 返回本段英文原文；英文句 → 返回本段中文（按句序近似取第 N 句）
  fallbackTrans(sel) {
    const seg = this.data.segs[sel.segi]
    if (!seg) return ''
    if (sel.zh) return (seg.en || '').trim()
    const z = (seg.zh || '').trim()
    if (!z) return ''
    const parts = z.match(/[^。！？!?…；;]+[。！？!?…；;]?/g) || []
    if (!parts.length) return z
    const idx = Math.min(sel.si || 0, parts.length - 1)
    return parts[idx]
  },

  closeSPop() { this.setData({ sPop: null }) },

  copyTranslated() {
    const t = this.data.sPop && this.data.sPop.zh
    if (!t) return
    wx.setClipboardData({
      data: t,
      success: () => wx.showToast({ title: '已复制译文', icon: 'success' })
    })
  },

  // 首次阅读提示：长按句子=复制/翻译，点单词=查词
  guideTip() {
    try {
      if (wx.getStorageSync('read_sel_tip')) return
      wx.setStorageSync('read_sel_tip', 1)
    } catch (e) {}
    wx.showToast({ title: '长按句子=复制/翻译 · ✂️选词可只取句中一部分 · 点单词查词', icon: 'none', duration: 3200 })
  },

  noop() {}
})
