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
const MAX_PER_CAT = 3   // 每类最多取几条标题
const MAX_TOTAL = 15    // 全天最多翻译条数（控制免费翻译额度）
const TRANS_CONC = 3    // 翻译并发数

// ---------- 工具 ----------
function dateKey(d) {
  d = d || new Date()
  const off = new Date(d.getTime() + 8 * 3600 * 1000)
  return off.toISOString().slice(0, 10)
}

function getText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ReadEnglish/1.0' }
    }, (res) => {
      if (res.statusCode !== 200) return reject(new Error('http ' + res.statusCode))
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => resolve(data))
    })
    req.setTimeout(9000, () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
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
    req.setTimeout(8000, () => { req.destroy(); resolve('') })
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
  const cats = Object.keys(FEEDS)
  const fetched = await mapLimit(cats, cats.length, async (cat) => {
    try {
      const xml = await getText(BBC_RSS.replace('%s', FEEDS[cat]))
      return { cat, titles: parseTitles(xml, MAX_PER_CAT) }
    } catch (e) {
      return { cat, titles: [] }
    }
  })
  // 打平成待翻译句列表，保持兴趣类别
  const lines = []
  fetched.forEach(f => {
    ;(f.titles || []).forEach(t => {
      if (lines.length < MAX_TOTAL) lines.push({ cat: f.cat, en: t })
    })
  })
  if (!lines.length) return []
  const zhList = await mapLimit(lines, TRANS_CONC, l => translateMyMemory(l.en))
  const items = []
  lines.forEach((l, i) => {
    items.push({ cat: l.cat, en: l.en, zh: zhList[i] || '' })
  })
  return items
}

// ---------- 入口 ----------
exports.main = async () => {
  const date = dateKey()
  // 1) 当日已有 → 直接返回
  try {
    const r = await db.collection(COLL).doc(date).get()
    const d = r && r.data
    if (d && d.items && d.items.length) {
      return { ok: true, date, items: d.items, cached: true }
    }
    if (d && d.empty) {
      // 当日已尝试但失败过 → 不再重复抓取，让客户端走离线兜底
      return { ok: true, date, items: [], empty: true }
    }
  } catch (e) { /* 集合不存在等，继续生成 */ }

  // 2) 生成当日内容
  let items = []
  try { items = await buildFeed() } catch (e) { items = [] }

  // 3) 写入（失败不影响返回，客户端另有离线兜底）
  try {
    await db.collection(COLL).doc(date).set({
      data: items.length
        ? { date, items, source: 'BBC', updatedAt: Date.now() }
        : { date, items: [], empty: true, updatedAt: Date.now() }
    })
  } catch (e) {}

  return { ok: true, date, items, source: 'BBC' }
}
