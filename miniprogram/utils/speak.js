// utils/speak.js —— 单词/句子 TTS + 整章顺序朗读
// 单例音频；失败自动重试、多音源回退、播放看门狗（7s 未出声切源）。
// 整章朗读 = 句子队列：逐句播放（上一句播完自动播下一句），
//   支持 暂停(句内原位续播) / 跳句 / 停止，全部与单句播放共用同一音频实例。

const SOURCE_TIMEOUT = 7000 // 单个音源等待开始播放的最长时间(ms)

let ctx = null
let rate = 1 // 整章朗读语速（0.5 ~ 2），单句/单词发音始终按 1 倍速

// 调整整章语速：立即作用于当前句；后续每句 startUrl 时也会重新应用
function setChapterRate(r) {
  rate = Math.max(0.5, Math.min(2, Number(r) || 1))
  if (ctx) {
    const t = ctx._task
    ctx.playbackRate = (chapter && !chapter.dead && t && t.cb && t.cb.type === 'ch') ? rate : 1
  }
}
// 当前“正在播放/重试的单句条目”。ctx._task 记录这段音频归属谁。
let cur = null
// 整章朗读任务 { items, idx, total, paused, dead, opts }
let chapter = null

let lastToastAt = 0

function hasChinese(s) {
  return /[\u4e00-\u9fff]/.test(s)
}

// 英文“单词样”（无空格/无标点），如 hello / don't / 3-day
function looksLikeWord(s) {
  return /^[A-Za-z][A-Za-z0-9'’-]*(?:-\s?[A-Za-z0-9'’-]+)*$/.test(s) && !/[\s.,!?;:]/.test(s)
}

// 文本语言 + 是否单词 → 决定音源顺序，让最常见的场景第一个源就快
function buildUrls(text, isWord) {
  const q = encodeURIComponent(text)
  if (hasChinese(text)) {
    return [
      'https://fanyi.baidu.com/gettts?lan=zh&text=' + q + '&spd=5&source=web',
      'https://dict.youdao.com/dictvoice?audio=' + q + '&type=2'
    ]
  }
  if (isWord) {
    return [
      'https://dict.youdao.com/dictvoice?audio=' + q + '&type=1',
      'https://fanyi.baidu.com/gettts?lan=en&text=' + q + '&spd=5&source=web'
    ]
  }
  return [
    'https://fanyi.baidu.com/gettts?lan=en&text=' + q + '&spd=5&source=web',
    'https://dict.youdao.com/dictvoice?audio=' + q + '&type=1'
  ]
}

function toastFail() {
  const now = Date.now()
  if (now - lastToastAt < 2500) return // 节流：2.5s 内只弹一次
  lastToastAt = now
  wx.showToast({ title: '发音加载失败，请检查网络', icon: 'none' })
}

function cleanText(v) {
  return String(v || '').replace(/\s+/g, ' ').trim()
}

// ---------- 基础音频操作 ----------

function startUrl(t) {
  const c = ensureCtx()
  ctx._task = null // 先解除旧音频归属，避免 stop 引发的回调误伤新任务
  c.stop()
  clearTimeout(t.watchdog)
  t.started = false
  ctx._task = t
  c.src = t.urls[t.urlIndex]
  c.playbackRate = (t.cb && t.cb.type === 'ch') ? rate : 1 // 整章按用户语速，单句还原 1 倍
  c.play()
  // 看门狗：X 秒内没开始播放就视为该源太慢，切下一个源
  t.watchdog = setTimeout(() => {
    if (ctx._task === t && !t.dead) failTask(t, true)
  }, SOURCE_TIMEOUT)
}

// 开始一个新条目（替换旧的 cur）
function startEntry(urls, cb) {
  if (cur) {
    cur.dead = true
    clearTimeout(cur.retryTimer)
    clearTimeout(cur.watchdog)
  }
  cur = {
    urls, urlIndex: 0, attempt: 0, dead: false, started: false,
    cb: cb || null, retryTimer: null, watchdog: null
  }
  startUrl(cur)
}

// 停止当前音频并清空单句条目
function stopAudio() {
  if (cur) {
    cur.dead = true
    clearTimeout(cur.retryTimer)
    clearTimeout(cur.watchdog)
    cur = null
  }
  if (ctx) {
    ctx._task = null
    ctx.stop()
  }
}

// 当前音源彻底放弃（重试 + 切源都无效）
function giveUp(t) {
  t.dead = true
  if (ctx && ctx._task === t) ctx._task = null
  clearTimeout(t.retryTimer)
  clearTimeout(t.watchdog)
  if (t.cb && t.cb.type === 'ch') {
    // 整章朗读：某一句彻底失败 → 跳过继续下一句；连续失败只在首/整批提示一次
    const cb = t.cb
    if (chapter && !chapter.dead && !chapter.paused && chapter.idx === cb.idx) {
      chapter.failStreak = (chapter.failStreak || 0) + 1
      if (chapter.failStreak <= 1 || chapter.failStreak % 10 === 0) toastFail()
      advanceChapter()
    }
  } else {
    toastFail()
  }
}

// 当前音源失败：error=true 时先同源重试一次；超时/已重试则切下一个源
function failTask(t, fromTimeout) {
  if (!t || t.dead) return
  if (!ctx || ctx._task !== t) return
  // 整章朗读处于暂停时，忽略延迟上报的错误，不自动重试/切句
  if (chapter && chapter.paused && t.cb && t.cb.type === 'ch') return

  if (!fromTimeout) {
    t.attempt++
    if (t.attempt < 2) {
      clearTimeout(t.retryTimer)
      t.retryTimer = setTimeout(() => startUrl(t), 500)
      return
    }
  }
  if (t.urlIndex < t.urls.length - 1) {
    t.urlIndex++
    t.attempt = 0
    clearTimeout(t.retryTimer)
    t.retryTimer = setTimeout(() => startUrl(t), fromTimeout ? 100 : 400)
    return
  }
  giveUp(t)
}

function ensureCtx() {
  if (ctx) return ctx
  ctx = wx.createInnerAudioContext()
  ctx.obeyMuteSwitch = false // iOS 静音拨片下也强制出声

  ctx.onError(() => failTask(ctx._task, false))

  // 真正开始出声 → 取消看门狗
  ctx.onPlay(() => {
    const t = ctx._task
    if (t) {
      t.started = true
      clearTimeout(t.watchdog)
      if (t.cb && t.cb.type === 'ch' && chapter) chapter.failStreak = 0
    }
  })

  // 一句自然播完：单句→结束；整章→播下一句
  ctx.onEnded(() => {
    const t = ctx._task
    if (!t) return
    t.dead = true
    ctx._task = null
    clearTimeout(t.watchdog)
    const cb = t.cb
    if (cb && cb.type === 'ch' && chapter && !chapter.dead && !chapter.paused && chapter.idx === cb.idx) {
      advanceChapter()
    }
  })

  // iOS 上偶尔 play 在资源就绪前被吞掉 → canplay 后再补一次，代价为零
  ctx.onCanplay(() => {
    const t = ctx._task
    if (t && !t.dead) ctx.play()
  })
  return ctx
}

// ---------- 单句 / 单词播放 ----------

function playText(text, opts) {
  opts = opts || {}
  const raw = cleanText(text)
  if (!raw) return
  killChapter() // 单句播放会终止整章朗读
  const urls = buildUrls(raw, opts.word || looksLikeWord(raw))
  if (!urls.length) return
  stopAudio()
  startEntry(urls, null)
}

// ---------- 整章顺序朗读 ----------

function killChapter() {
  if (chapter) { chapter.dead = true; chapter = null }
}

function emitChapter(ch) {
  if (ch.opts && ch.opts.onItem) {
    const it = ch.items[ch.idx]
    ch.opts.onItem({
      idx: ch.idx, total: ch.total,
      text: it ? it.text : '',
      playing: !ch.paused,
      meta: it ? it.meta : null // 业务侧段落坐标（阅读页用它取本段中文对照）
    })
  }
}

function advanceChapter() {
  const ch = chapter
  if (!ch || ch.dead) return
  ch.idx++
  if (ch.idx >= ch.total) {
    const done = ch
    killChapter()
    stopAudio()
    if (done.opts && done.opts.onDone) done.opts.onDone()
    return
  }
  emitChapter(ch)
  startEntry(ch.items[ch.idx].urls, { type: 'ch', idx: ch.idx })
}

function playChapter(items, opts) {
  killChapter()
  stopAudio()
  opts = opts || {}
  const list = []
  ;(items || []).forEach((it) => {
    const text = cleanText(it.text)
    if (!text) return
    list.push({
      text,
      urls: buildUrls(text, opts.forceWord || looksLikeWord(text)),
      meta: it.meta || null
    })
  })
  if (!list.length) return
  chapter = { items: list, idx: 0, total: list.length, paused: false, dead: false, opts }
  emitChapter(chapter)
  startEntry(list[0].urls, { type: 'ch', idx: 0 })
}

function chapterPause() {
  const ch = chapter
  if (!ch || ch.dead || ch.paused) return
  ch.paused = true
  if (cur) clearTimeout(cur.watchdog) // 暂停期间不触发看门狗
  if (ctx) ctx.pause()
}

function chapterResume() {
  const ch = chapter
  if (!ch || ch.dead || !ch.paused) return
  ch.paused = false
  const t = cur
  if (ctx && t && !t.dead) {
    ctx.play()
    if (!t.started) startUrl(t) // 资源尚未开始播 → 重新走一遍加载流程
    else emitChapter(ch)
  } else {
    // 没有活动条目（极端情况）→ 从当前句重新开始
    if (ch.idx >= ch.total) { killChapter(); return }
    emitChapter(ch)
    startEntry(ch.items[ch.idx].urls, { type: 'ch', idx: ch.idx })
  }
}

// 跳到第 i 句（0 起）播放；处于暂停状态则停在新句上等待
function chapterSeek(i) {
  const ch = chapter
  if (!ch || ch.dead) return
  const n = Math.max(0, Math.min(ch.total - 1, Math.round(Number(i) || 0)))
  ch.idx = n
  emitChapter(ch)
  startEntry(ch.items[n].urls, { type: 'ch', idx: n })
  if (ch.paused && ctx) {
    if (cur) clearTimeout(cur.watchdog)
    ctx.pause()
  }
}

// 完全停止：结束整章任务 + 停止音频
function stop() {
  killChapter()
  stopAudio()
}

module.exports = {
  playText, stop, setChapterRate,
  playChapter, chapterPause, chapterResume, chapterSeek
}
