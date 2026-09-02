// scripts/build-wind-willows.js —— 《柳林风声》全本英文导入文件生成器
// 数据源：scripts/cache/wind-in-the-willows.txt（Project Gutenberg #289，公版）
// 输出（JSONL，控制台导入，模式选 Upsert）：
//   scripts/out/novels_wind_willows.json          → novels 集合（version=2，接管内置同名样书并提示更新）
//   scripts/out/novel_chapters_wind_willows.json  → novel_chapters 集合（12 章全文）
// 用法：node scripts/build-wind-willows.js
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, 'cache', 'ww-C.txt')
const OUT_DIR = path.join(__dirname, 'out')

// ---------- 1. 读取并切出正文（*** START / *** END 之间） ----------
let raw = fs.readFileSync(SRC, 'utf8')
raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
const sMark = '*** START OF THIS PROJECT GUTENBERG EBOOK THE WIND IN THE WILLOWS ***'
const eMark = '*** END OF THIS PROJECT GUTENBERG EBOOK THE WIND IN THE WILLOWS ***'
const si = raw.indexOf(sMark)
const ei = raw.indexOf(eMark)
if (si < 0 || ei < 0) { console.error('找不到 START/END 标记'); process.exit(1) }
const body = raw.slice(si + sMark.length, ei)

// ---------- 2. 章节标题（形如 "I. THE RIVER BANK" / 'XI. "LIKE SUMMER TEMPESTS...'） ----------
const heads = []
const bodyLines = body.split('\n')
// 章标题行特征：罗马数字 + 点 + 全大写标题（如 "I. THE RIVER BANK"）。
// 规避两类噪声：CONTENTS 目录行（≥4 空格缩进）与正文对话误以 "I." 开头（含小写字母）。
bodyLines.forEach((ln, i) => {
  const t = ln.replace(/\s+$/, '')
  const m = t.match(/^([IVXL]+)\.[ \t]+(['"“”]?)([A-Z][^a-z]*)['"“”]?$/)
  if (!m) return
  if (/^[ \t]{4,}/.test(ln)) return // TOC 行缩进 ≥4
  const name = (m[3] || '').replace(/^['"“”]+|['"“”]+$|[._]+$/g, '').trim()
  if (!name || name.split(/\s+/).length < 2) return
  heads.push({ roman: m[1], name, line: i })
})
// 只保留 12 章（应为 1..XII 顺序）。若因误匹配 >12，保留第一个 12
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 }
heads.sort((a, b) => a.line - b.line)
const chaptersMeta = []
for (const h of heads) {
  const n = ROMAN[h.roman]
  if (!n) continue
  chaptersMeta[n - 1] = h
}
for (let i = 0; i < 12; i++) {
  if (!chaptersMeta[i]) { console.error('缺少第 ' + (i + 1) + ' 章标题，解析失败'); process.exit(1) }
}

// ---------- 3. 把章节区间内的物理行合并为「段落」 ----------
function titleCase(s) {
  // "THE RIVER BANK" → "The River Bank"；"TOAD'S ADVENTURES" → "Toad's Adventures"；介词小写
  const small = new Set(['of', 'and', 'the', 'at', 'in', 'to', 'a', 'for', 'by', 'on', 'with'])
  const ws = s.toLowerCase().split(/\s+/)
  return ws.map((w, i) => {
    if (!w) return w
    if (i > 0 && small.has(w)) return w
    return w.replace(/^([^a-z0-9]*)([a-z0-9])/, (all, p, c) => p + c.toUpperCase())
  }).join(' ')
}

function splitLongPara(para) {
  // 段落过长（>120 词）时按句子边界拆，便于阅读器渲染与定位
  const words = para.trim().split(/\s+/).length
  if (words <= 120) return [para.trim()]
  const parts = para.trim().split(/(?<=[.!?]["”']?)\s+(?=["“'(A-Z])/)
  const out = []
  let cur = ''
  for (const p of parts) {
    if ((cur + ' ' + p).trim().split(/\s+/).length <= 120) cur = (cur + ' ' + p).trim()
    else { if (cur) out.push(cur); cur = p }
  }
  if (cur) out.push(cur)
  return out
}

const chapters = []
for (let i = 0; i < 12; i++) {
  const meta = chaptersMeta[i]
  const start = meta.line + 1
  const end = i + 1 < 12 ? chaptersMeta[i + 1].line : bodyLines.length
  const slice = bodyLines.slice(start, end)

  const paras = []
  let buf = ''
  const flush = () => {
    if (buf.trim()) paras.push(buf.trim())
    buf = ''
  }
  for (const ln of slice) {
    if (!ln.trim()) { flush(); continue }
    if (/^[ \t]+$/.test(ln)) { flush(); continue }
    if (buf) {
      // 行尾连字符拼词
      if (/-\s*$/.test(buf) && !/[.!?]["”']?\s*$/.test(buf)) buf = buf.replace(/-\s*$/, '')
      else buf += ' '
    }
    buf += ln.trim()
  }
  flush()

  const segments = []
  for (const p of paras) {
    for (const piece of splitLongPara(p)) {
      const clean = piece.replace(/\s+/g, ' ').trim()
      if (!clean) continue
      if (/^\s*(?:\*\s*)+$/.test(clean)) continue // 版式上的星号装饰分隔线
      if (/^End of (the )?Project Gutenberg/i.test(clean)) continue // 剔除文库版权尾注
      segments.push({ en: clean, zh: '' })
    }
  }
  const wordCount = segments.reduce((n, s) => n + (s.en.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length, 0)
  chapters.push({
    seq: i,
    title: titleCase(meta.name),
    segments,
    wordCount
  })
  console.log(`第${i + 1}章  ${chapters[i].title.padEnd(42)} ${segments.length}段 ${wordCount}词`)
}

const totalWords = chapters.reduce((n, c) => n + c.wordCount, 0)
console.log(`\n合计 ${chapters.length} 章 / ${totalWords.toLocaleString()} 词`)

// ---------- 4. 输出 novels + novel_chapters 导入文件 ----------
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
const now = Date.now()

const novelDoc = {
  _id: 'wind-willows',
  novelId: 'wind-willows',
  title: '柳林风声 · 英文原版',
  enTitle: 'The Wind in the Willows',
  author: 'Kenneth Grahame · 公版',
  desc: '全本英文原版：鼹鼠、河鼠、獾与蛤蟆的四季历险，经典儿童文学。通篇点词即查，自动更新阅读进度。',
  emoji: '🌾',
  color: '#8a9a5b',
  wordCount: totalWords,
  chapterCount: 12,
  version: 2, // > 内置样书(1) → 书架提示「更新为全本」
  updatedAt: now
}
const novelLines = [novelDoc]
const chLines = chapters.map(c => ({
  _id: `wind-willows-${c.seq}`,
  novelId: 'wind-willows',
  seq: c.seq,
  title: c.title,
  segments: c.segments,
  version: 2,
  updatedAt: now
}))

fs.writeFileSync(path.join(OUT_DIR, 'novels_wind_willows.json'), novelLines.map(x => JSON.stringify(x)).join('\n'))
fs.writeFileSync(path.join(OUT_DIR, 'novel_chapters_wind_willows.json'), chLines.map(x => JSON.stringify(x)).join('\n'))
console.log('\n已生成：')
console.log('  scripts/out/novels_wind_willows.json          （1 行 → 导入 novels 集合）')
console.log('  scripts/out/novel_chapters_wind_willows.json  （12 行 → 导入 novel_chapters 集合）')
console.log('云开发控制台 → 数据库 → 对应集合 → 导入，选择「Upsert」。')
