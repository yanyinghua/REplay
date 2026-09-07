// cloudfunctions/daily-trending/index.js —— 每日双语热点内容流（懒生成）
// 用法：客户端直接 wx.cloud.callFunction({ name:'daily-trending' })
// 逻辑：
//   1) 查询当日文档（集合 trending_daily，docId = 日期 YYYY-MM-DD）
//   2) 已存在 → 直接返回，避免每天重复抓取/烧翻译额度
//   3) 不存在 → 抓取 BBC RSS 英文头条（tech/business/science/health/sport/entertainment 六类）
//      → MyMemory 翻译成中文 → 写入当日文档 → 返回（当天第一个请求会稍慢）
// 备注：
//   · 云数据库集合 trending_daily 需预先创建（不创建也能跑，只是无法缓存，客户端自动回退离线）
//   · 建议把本云函数超时时间调到 20s（首次生成需并发抓取+翻译）
const https = require('https')
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLL = 'trending_daily'
const BBC_RSS = 'https://feeds.bbci.co.uk/news/%s/rss.xml'
const FEEDS = {
  tech: 'technology',
  business: 'business',
  science: 'science_and_environment',
  health: 'health',
  sport: 'sport',
  entertainment: 'entertainment_and_arts'
}
const MAX_PER_CAT = 1   // 每类最多取 1 条标题：6 个分类共 6 条，翻译量最小
const MAX_TOTAL = 6     // 全天最多翻译条数（控制免费翻译额度与生成时间）
const TRANS_CONC = 3    // 翻译并发数（MyMemory 免费接口并发过高会限流/变慢，3 更稳）
const FETCH_TIMEOUT = 4000 // 单条 RSS/翻译请求最多等 4 秒，失败即跳过，避免拖垮整体
const DEADLINE_MS = 14000  // 整体生成硬截止 14 秒：到达后直接返回已拿到/已翻译的内容，绝不在函数里超 20 秒
const RETRY_MS = 30 * 60 * 1000 // 当天生成失败后：超过 30 分钟允许再次自动重试，避免偶发失败导致全天无内容

const FALLBACK = require('./fallback')
const FALLBACK_ITEMS = FALLBACK.OFFLINE_ITEMS || []

// ---------- 工具 ----------
function dateKey(d) {
  d = d || new Date()
  const off = new Date(d.getTime() + 8 * 3600 * 1000)
  return off.toISOString().slice(0, 10)
}

// 按日期做伪随机打乱：兜底内容每天顺序不同，避免天天一样
function seededRand(seed) {
  let t = (seed >>> 0) || 1
  return () => {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
function shuffleByDate(list, date) {
  const a = list.slice()
  let seed = 7
  String(date).split('-').forEach(p => { seed = seed * 31 + (Number(p) || 0) })
  const rand = seededRand(seed)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

function fetchOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ReadEnglish/1.0' }
    }, (res) => {
      if (res.statusCode !== 200) return reject(new Error('http ' + res.statusCode))
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => resolve(data))
    })
    req.setTimeout(FETCH_TIMEOUT, () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
  })
}

// 单次抓取（不重试）：生成阶段重点是速度，失败即跳过，避免重试把总时间拉爆
async function getText(url) {
  return fetchOnce(url)
}

// 绝对超时包装：很多外网服务挂起时不会主动断开，仅靠 socket 空闲超时可能失灵
// （数据流一直在传但永远不结束）。这里无论它怎样，到点一律 resolve('')，保证函数绝不挂死。
function limit(p, ms) {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve('')
    }, ms)
    Promise.resolve(p).then(v => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(v)
    }, () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve('')
    })
  })
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sentenceize(t) {
  let s = decodeEntities(t)
  s = s.replace(/^[\s"'“]+/, '').replace(/[\s"'”]+$/, '')
  if (!s) return ''
  if (!/[.!?]$/.test(s)) s += '.'
  return s
}

// 从 RSS XML 里取 <item> 的 <title>
function parseTitles(xml, max) {
  const out = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = re.exec(xml)) && out.length < max) {
    const t = (m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''
    const s = sentenceize(t)
    const words = s.split(/\s+/).length
    if (s && words >= 4 && words <= 30 && s.length >= 16 && s.length <= 200) out.push(s)
  }
  return out
}

function translateMyMemory(en) {
  return new Promise((resolve) => {
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(en) + '&langpair=en|zh-CN'
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ReadEnglish/1.0' }
    }, (res) => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(data)
          let out = j && j.responseData && j.responseData.translatedText
          if (typeof out !== 'string' || !out.trim() || out.indexOf('MYMEMORY WARNING') >= 0) {
            return resolve('')
          }
          out = out.replace(/\s*\n\s*/g, '\n').trim()
          // 未翻成中文（返回原文）视为失败
          if (!/[\u4e00-\u9fff]/.test(out)) return resolve('')
          resolve(out)
        } catch (err) { resolve('') }
      })
    })
    req.setTimeout(FETCH_TIMEOUT, () => { req.destroy(); resolve('') })
    req.on('error', () => resolve(''))
  })
}

// 并发限制的 map
function mapLimit(list, n, fn) {
  return new Promise((resolve) => {
    const out = new Array(list.length)
    let i = 0
    let done = 0
    const worker = () => {
      if (i >= list.length) return
      const idx = i++
      fn(list[idx]).then(v => {
        out[idx] = v
        done++
        if (done === list.length) return resolve(out)
        worker()
      })
    }
    for (let k = 0; k < Math.min(n, list.length); k++) worker()
  })
}

// ---------- 抓取 + 翻译 ----------
async function buildFeed() {
  const start = Date.now()
  const over = () => Date.now() - start > DEADLINE_MS
  const cats = Object.keys(FEEDS)

  // 1) 尝试从 BBC RSS 抓标题
  const fetched = await mapLimit(cats, cats.length, async (cat) => {
    if (over()) return { cat, titles: [] }
    try {
      // 单个 RSS 绝对 3.5 秒强制结束，6 个并发 → RSS 阶段最多约 4 秒
      const xml = await limit(getText(BBC_RSS.replace('%s', FEEDS[cat])), 3500)
      const titles = parseTitles(xml, MAX_PER_CAT)
      if (!titles.length && xml) console.warn('[daily-trending] ' + cat + ' RSS 有响应但无可用标题')
      return { cat, titles }
    } catch (e) {
      console.warn('[daily-trending] ' + cat + ' RSS 抓取失败：', e && e.message)
      return { cat, titles: [] }
    }
  })

  // 打平成待翻译句列表，保持兴趣类别
  const lines = []
  fetched.forEach(f => {
    ;(f.titles || []).forEach(t => {
      if (lines.length < MAX_TOTAL && !over()) lines.push({ cat: f.cat, en: t })
    })
  })

  // 2) 抓到有效标题 → 翻译成中文
  if (lines.length) {
    const zhList = await mapLimit(lines, TRANS_CONC, l => {
      // 接近硬截止时不再发起新翻译，避免函数被平台掐掉
      if (over()) return Promise.resolve('')
      // 单条翻译绝对 3.5 秒强制结束；3 并发 × 2 批 → 翻译阶段最多约 8 秒
      return limit(translateMyMemory(l.en), 3500)
    })
    const items = []
    let allTranslated = true
    lines.forEach((l, i) => {
      const zh = zhList[i] || ''
      if (!zh) allTranslated = false
      // 翻译失败时至少保留英文原文，避免双语卡片中文彻底为空
      items.push({ cat: l.cat, en: l.en, zh: zh || l.en })
    })
    if (allTranslated) return { source: 'BBC', items }
    // 部分未翻译：能用，但记个日志
    console.warn('[daily-trending] 部分标题翻译失败，返回含英文原文的内容')
    return { source: 'BBC', items }
  }

  // 3) 外部 RSS/翻译全失败 → 用内置兜底双语短句，保证首页始终有内容
  console.warn('[daily-trending] 外部源全部失败，使用内置兜底内容 date=' + dateKey())
  const fb = shuffleByDate(FALLBACK_ITEMS, dateKey()).slice(0, MAX_TOTAL)
  return { source: 'fallback', items: fb }
}

// ---------- 入口 ----------
// 参数：event.force = true 时忽略当天缓存、强制重新抓取+翻译覆盖（手动刷新用）
// 注意：force 若本次生成失败，会保留旧缓存不清空，避免刷新把好的内容刷没
exports.main = async (event = {}) => {
  const force = !!(event && event.force)
  const date = dateKey()
  const now0 = Date.now()

  // 1) 非 force：当日已有 → 直接返回（懒生成缓存命中）
  let keep = null
  if (!force) {
    try {
      const r = await db.collection(COLL).doc(date).get()
      const d = r && r.data
      if (d && d.items && d.items.length) {
        return { ok: true, date, items: d.items, cached: true }
      }
      if (d && d.empty) {
        // 当日失败过：30 分钟内不重复抓取（避免反复烧翻译额度）；超时后允许自动重试，防止整天没有当日内容
        if (Date.now() - (d.lastAttemptAt || 0) < RETRY_MS) {
          return { ok: true, date, items: [], empty: true }
        }
      }
    } catch (e) { /* 集合不存在等，继续生成 */ }
  } else {
    // force：先读出旧缓存，仅用于生成失败时兜底保留
    try { const r = await db.collection(COLL).doc(date).get(); keep = (r && r.data) || null } catch (e) { keep = null }
  }

  // 2) 生成当日内容
  let feed = { source: '', items: [] }
  try { feed = await buildFeed() } catch (e) { console.error('[daily-trending] buildFeed error:', e && e.message) ; feed = { source: '', items: [] } }
  const items = feed.items || []
  const source = feed.source || (items.length ? 'BBC' : '')
  if (!items.length) console.warn('[daily-trending] 生成内容为空 date=' + date + ' force=' + force + ' 耗时=' + (Date.now() - now0) + 'ms')

  // 3) 写入（失败不影响返回，客户端另有离线兜底）
  const now = Date.now()
  try {
    if (items.length) {
      await db.collection(COLL).doc(date).set({
        data: { date, items, source, updatedAt: now, lastAttemptAt: now }
      })
    } else if (!force) {
      await db.collection(COLL).doc(date).set({
        data: { date, items: [], empty: true, updatedAt: now, lastAttemptAt: now }
      })
    }
    // force 且生成空：不覆盖，保留 keep（旧内容仍可继续用）
  } catch (e) {}

  if (force) {
    // 手动刷新失败但旧缓存还在 → 返回旧内容并注明，前端提示"暂未刷到新内容"
    if (!items.length && keep && keep.items && keep.items.length) {
      return { ok: true, date, items: keep.items, cached: true, refreshed: false }
    }
    return { ok: items.length > 0, date, items, source, refreshed: true }
  }
  return { ok: true, date, items, source }
}
