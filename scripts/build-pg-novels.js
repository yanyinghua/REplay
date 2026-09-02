// scripts/build-pg-novels.js —— 通用公版整书构建器（纯英文原版 · 云端导入）
// 用法：node scripts/build-pg-novels.js
// 输出（JSONL / Upsert 导入）：
//   scripts/out/novels_<alias>.json          → novels 集合（version=2 接管同名内置样书）
//   scripts/out/novel_chapters_<alias>.json  → novel_chapters 集合
// 章标题格式支持：
//   chapterNumOnly   —— "Chapter 1" 或 "CHAPTER I."（无内嵌标题；允许尾点与 "--题名" 尾缀）
//   chapterNumTitle  —— "CHAPTER I. Down the Rabbit-Hole"（罗马/数字 + 内嵌标题，点可省）
//   numTitle         —— "1.  The Cyclone"（数字 + 内嵌标题）
//   numAloneTitle    —— 独立数字行 "1"（题名在下一非空行，如金银岛）
//   romanDotTitle    —— 顶格 "I. The Period"（无 Chapter 前缀、无缩进，如双城记）
//   chapterWordOnly  —— "CHAPTER ONE"（英文数词独立行，题名在下一非空行，如小妇人）
const fs = require('fs')
const path = require('path')
const OUT_DIR = path.join(__dirname, 'out')

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 }
function romanToNum(s) {
  const up = s.toUpperCase()
  if (/^\d+$/.test(up)) return Number(up)
  if (!/^[IVXLCDM]+$/.test(up)) return -1
  let total = 0
  for (let i = 0; i < up.length; i++) {
    const cur = ROMAN[up[i]], next = ROMAN[up[i + 1]] || 0
    total += cur < next ? -cur : cur
  }
  return total
}

// 各书配置：别名(src, alias, novelId, 展示信息, 章标题风格, 期望章数)
const BOOKS = [
  {
    src: 'pride-prejudice.txt', alias: 'pride-prejudice', novelId: 'pride-prejudice',
    title: '傲慢与偏见 · 英文原版', enTitle: 'Pride and Prejudice',
    author: 'Jane Austen · 公版',
    desc: '全本英文原版：伊丽莎白与达西的爱情经典，英国乡绅群像。61 章 · 约 12 万词，点词即查。',
    emoji: '🎩', color: '#b76e79',
    style: 'chapterNumOnly', expect: 61
  },
  {
    src: 'alice.txt', alias: 'alice-wonderland', novelId: 'alice-wonderland',
    title: '爱丽丝漫游奇境 · 英文原版', enTitle: 'Alice’s Adventures in Wonderland',
    author: 'Lewis Carroll · 公版',
    desc: '全本英文原版：掉进兔子洞的完整奇遇，柴郡猫与疯帽匠悉数登场。12 章全文，点词即查。',
    emoji: '🐇', color: '#7b5cf0',
    style: 'chapterNumTitle', expect: 12
  },
  {
    src: 'wizard-oz.txt', alias: 'wizard-oz', novelId: 'wizard-oz',
    title: '绿野仙踪 · 英文原版', enTitle: 'The Wonderful Wizard of Oz',
    author: 'L. Frank Baum · 公版',
    desc: '全本英文原版：多萝西与稻草人、铁皮人、胆小狮的翡翠城之旅。24 章全文，点词即查。',
    emoji: '🏰', color: '#e2a13b',
    style: 'numTitle', expect: 24,
    // 该版本文本把第24章标题错排在正文开头之后；命中此句的尾段应归入下一章
    mergeIntoNext: /^The Silver Shoes took but three steps/i
  },
  {
    src: 'secret-garden.txt', alias: 'secret-garden', novelId: 'secret-garden',
    title: '秘密花园 · 英文原版', enTitle: 'The Secret Garden',
    author: 'Frances Hodgson Burnett · 公版',
    desc: '全本英文原版：倔强孤女玛丽揭开尘封花园的秘密，让荒园与人心一同苏醒。27 章全文，点词即查。',
    emoji: '🌸', color: '#5fad6b',
    style: 'chapterNumOnly', expect: 27, nextLineTitle: true
  },
  {
    src: 'treasure-island.txt', alias: 'treasure-island', novelId: 'treasure-island',
    title: '金银岛 · 英文原版', enTitle: 'Treasure Island',
    author: 'Robert Louis Stevenson · 公版',
    desc: '全本英文原版：少年吉姆的寻宝航海记，独腿厨子与藏宝图的冒险经典。34 章全文，点词即查。',
    emoji: '⛵', color: '#c98a3d',
    style: 'numAloneTitle', expect: 34, nextLineTitle: true,
    filterPara: /^PART\s+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|I|II|III|IV|V|VI)\s*--/i
  },
  {
    src: 'tom-sawyer.txt', alias: 'tom-sawyer', novelId: 'tom-sawyer',
    title: '汤姆·索亚历险记 · 英文原版', enTitle: 'The Adventures of Tom Sawyer',
    author: 'Mark Twain · 公版',
    desc: '全本英文原版：密西西比河畔顽童汤姆的夏日冒险，刷栅栏与洞穴寻宝名场面。35 章全文，点词即查。',
    emoji: '🎣', color: '#3f7fb3',
    style: 'chapterNumOnly', expect: 35
  },
  {
    src: 'huck-finn.txt', alias: 'huck-finn', novelId: 'huck-finn',
    title: '哈克贝利·费恩历险记 · 英文原版', enTitle: 'Adventures of Huckleberry Finn',
    author: 'Mark Twain · 公版',
    desc: '全本英文原版：哈克与逃亡者吉姆的密西西比河木筏之旅。43 章全文，点词即查。',
    emoji: '🛶', color: '#b3733f',
    style: 'chapterNumOnly', expect: 43
  },
  {
    src: 'tale-two-cities.txt', alias: 'tale-two-cities', novelId: 'tale-two-cities',
    title: '双城记 · 英文原版', enTitle: 'A Tale of Two Cities',
    author: 'Charles Dickens · 公版',
    desc: '全本英文原版：伦敦与巴黎双城联动的革命史诗，卡顿的牺牲名垂文学史。3 部 45 章全文，点词即查。',
    emoji: '⏳', color: '#8c6a4a',
    style: 'romanDotTitle', expect: 45,
    filterPara: /^Book the (?:First|Second|Third)\s*--/i
  },
  {
    src: 'jane-eyre.txt', alias: 'jane-eyre', novelId: 'jane-eyre',
    title: '简·爱 · 英文原版', enTitle: 'Jane Eyre',
    author: 'Charlotte Brontë · 公版',
    desc: '全本英文原版：寄人篱下的孤女到独立女性，灵魂平等宣言的爱情经典。38 章全文，点词即查。',
    emoji: '🕯', color: '#6a4f78',
    style: 'chapterNumOnly', expect: 38
  },
  {
    src: 'anne-green-gables.txt', alias: 'anne-green-gables', novelId: 'anne-green-gables',
    title: '绿山墙的安妮 · 英文原版', enTitle: 'Anne of Green Gables',
    author: 'L. M. Montgomery · 公版',
    desc: '全本英文原版：红发孤女安妮靠想象力点亮绿山墙的成长故事。38 章全文，点词即查。',
    emoji: '🌲', color: '#3f9b7a',
    style: 'chapterNumTitle', expect: 38
  },
  {
    src: 'little-women.txt', alias: 'little-women', novelId: 'little-women',
    title: '小妇人 · 英文原版', enTitle: 'Little Women',
    author: 'Louisa May Alcott · 公版',
    desc: '全本英文原版：南北战争背景下马奇家四姐妹的温暖成长群像。47 章全文，点词即查。',
    emoji: '🎀', color: '#c08fb0',
    style: 'chapterWordOnly', expect: 47, nextLineTitle: true
  }
]

// 章标题正则（目录与正文标题样式一致，靠「目录在前且份数相同」排除目录）
const HEADING = {
  chapterNumOnly: /^[ \t]*Chapter\s+((?:[IVXLCDM]+|\d+)(?:\.)?|The\s+Last)(?:\s*--\s*([A-Z][A-Za-z0-9'’ ]*))?\s*$/i,
  chapterNumTitle: /^[ \t]*Chapter\s+([IVXLCDM]+|\d+)\s*[.:\-]?\s+(.+)$/i,
  numTitle: /^[ \t]*(\d+)\s*[.:\-]\s+(.+)$/,
  numAloneTitle: /^[ \t]*(\d{1,2})\s*$/, // 仅独立数字行，题名在下一非空行
  romanDotTitle: /^([IVXLCDM]+)\.\s+(.+)$/, // 顶格 "I. The Period"（无缩进，避免命中目录的 Chapter 行）
  chapterWordOnly: /^[ \t]*Chapter\s+([a-z]+(?:-[a-z]+)?)\s*$/i // "CHAPTER ONE"，题名在下一非空行
}

function avgGap(cluster) {
  if (!cluster.length) return 0
  return (cluster[cluster.length - 1].line - cluster[0].line) / Math.max(1, cluster.length - 1)
}

function readBody(srcPath) {
  let raw = fs.readFileSync(srcPath, 'utf8')
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // PG 标记有两种写法："*** START OF ..." 或 "***START OF THE PROJECT GUTENBERG EBOOK ... ***"
  const s = raw.search(/^\*{3,}\s*START\s+OF.*$/m)
  const e = raw.search(/^\*{3,}\s*END\s+OF.*$/m)
  if (s < 0 && e < 0) return raw.split('\n') // 个别文本无标记：全文当作行，前置页会落在首章前被丢弃
  if (s < 0 || e < 0) throw new Error('START/END 标记不完整: ' + srcPath)
  return raw.slice(s, e).split('\n')
}

function cleanTitle(s, fallback) {
  const t = String(s || '').replace(/^[ \t"“'‘]+|[ \t"”'’]+$/g, '').trim()
  return t || fallback
}

// 题名规范化：全大写题名（如 "THERE IS NO ONE LEFT"）转 Title Case；已是大小写混合的原样保留
function normTitle(s) {
  s = String(s || '').trim()
  if (!s || /[a-z]/.test(s)) return s
  return s.split(/\s+/).map(w => {
    const idx = w.search(/[A-Za-z]/)
    if (idx < 0) return w
    return w.slice(0, idx) + w[idx].toUpperCase() + w.slice(idx + 1).toLowerCase()
  }).join(' ')
}

function splitLongPara(para, maxWords) {
  const words = para.trim().split(/\s+/).length
  if (words <= maxWords) return [para.trim()]
  const parts = para.trim().split(/(?<=[.!?]["”']?)\s+(?=["“'(A-Z])/)
  const out = []
  let cur = ''
  for (const p of parts) {
    if ((cur + ' ' + p).trim().split(/\s+/).length <= maxWords) cur = (cur + ' ' + p).trim()
    else { if (cur) out.push(cur); cur = p }
  }
  if (cur) out.push(cur)
  return out
}

function buildBook(cfg) {
  const lines = readBody(path.join(__dirname, 'cache', cfg.src))
  const re = HEADING[cfg.style]
  const headings = []
  lines.forEach((ln, i) => {
    const m = ln.replace(/\s+$/, '').match(re)
    if (!m) return
    const num = romanToNum(m[1]) // Alice/Oz 数值从标题数字取；chapterNumTitle group2 是标题文本
    headings.push({ line: i, num, title: m[2] || '' })
  })

  let heads = headings
  if (headings.length === cfg.expect * 2) {
    // 「目录 + 正文」两份且样式一致：目录永远在文件前部 → 取后半段即正文
    heads = headings.slice(headings.length - cfg.expect)
  }
  if (heads.length !== cfg.expect) {
    console.warn(`[${cfg.alias}] 标题命中 ${headings.length} 处（期望 ${cfg.expect}）`)
    headings.slice(0, 10).forEach(h => console.warn('  L' + h.line + '  ' + h.title.slice(0, 50)))
    throw new Error('章节数量不符，停止，避免脏数据导入')
  }
  const seqByOrder = heads.map((h, i) => ({ ...h, seq: i }))

  const chapters = []
  for (let i = 0; i < seqByOrder.length; i++) {
    const h = seqByOrder[i]
    const end = i + 1 < seqByOrder.length ? seqByOrder[i + 1].line : lines.length
    // 起始正文行；nextLineTitle 的书需先取标题行后的首个非空行作为题名并跳过它
    let start = h.line + 1
    let titleRaw = h.title
    if (cfg.nextLineTitle) {
      for (let j = h.line + 1; j < end; j++) {
        if (lines[j].trim()) { titleRaw = lines[j].trim(); start = j + 1; break }
      }
    }
    const slice = lines.slice(start, end)

    const paras = []
    let buf = ''
    const flush = () => { if (buf.trim()) paras.push(buf.trim()); buf = '' }
    for (const ln of slice) {
      if (!ln.trim()) { flush(); continue }
      if (buf) {
        if (/-\s*$/.test(buf) && !/[.!?]["”']?\s*$/.test(buf)) buf = buf.replace(/-\s*$/, '')
        else buf += ' '
      }
      buf += ln.trim()
    }
    flush()

    // 勘误/尾注（Transcriber's notes 等）都在 "THE END" 之后 → 遇之即止
    const bodyEnd = paras.findIndex(p => /^THE END$/.test(p.trim()))
    const bodyParas = bodyEnd >= 0 ? paras.slice(0, bodyEnd) : paras
    const segments = []
    for (const p of bodyParas) {
      if (cfg.filterPara && cfg.filterPara.test(p)) continue // 如金银岛的 PART n-- 大节分隔行
      for (const piece of splitLongPara(p, 130)) {
        const clean = piece.replace(/\s+/g, ' ').trim().replace(/^\|(?=[A-Z])/, '') // PG 小型大写标记 "|MRS."
        if (!clean) continue
        if (/^\s*(?:\*\s*)+$/.test(clean)) continue // 版式上的星号装饰分隔线（***** 等）
        if (/^(End of (the )?Project Gutenberg|Page\s+\d+,)/i.test(clean)) continue // 文库尾注 / 勘误表
        segments.push({ en: clean, zh: '' })
      }
    }
    // 标题：内嵌题名 / 标题行题名优先（全大写自动转 Title Case）；都没有则用 "Chapter N"
    let title = cleanTitle(normTitle(titleRaw), '')
    if (!title) title = 'Chapter ' + (i + 1)
    const wordCount = segments.reduce((n, s) => n + (s.en.match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g) || []).length, 0)
    chapters.push({ seq: i, title, segments, wordCount })
  }

  // 修正文本排印导致的段归属错误：某章命中 matchSeg 的尾段（含之后全部）并入下一章开头
  if (cfg.mergeIntoNext) {
    for (let i = 0; i < chapters.length - 1; i++) {
      const segs = chapters[i].segments
      const k = segs.findIndex(s => cfg.mergeIntoNext.test(s.en))
      if (k >= 0) {
        const move = segs.splice(k)
        chapters[i + 1].segments.unshift.apply(chapters[i + 1].segments, move)
      }
    }
  }
  chapters.forEach(c => { c.wordCount = c.segments.reduce((n, s) => n + (s.en.match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g) || []).length, 0) })
  const totalWords = chapters.reduce((n, c) => n + c.wordCount, 0)
  console.log(`\n《${cfg.title}》 ${chapters.length} 章 / ${totalWords.toLocaleString()} 词`)
  chapters.slice(0, 3).forEach(c => console.log('  #' + (c.seq + 1) + ' ' + c.title + '  ' + c.segments.length + '段'))
  console.log('  …')
  chapters.slice(-2).forEach(c => console.log('  #' + (c.seq + 1) + ' ' + c.title + '  ' + c.segments.length + '段'))

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const now = Date.now()
  const novelDoc = {
    _id: cfg.novelId, novelId: cfg.novelId,
    title: cfg.title, enTitle: cfg.enTitle, author: cfg.author, desc: cfg.desc,
    emoji: cfg.emoji, color: cfg.color,
    wordCount: totalWords, chapterCount: chapters.length,
    version: 2, updatedAt: now
  }
  const chLines = chapters.map(c => ({
    _id: `${cfg.novelId}-${c.seq}`, novelId: cfg.novelId,
    seq: c.seq, title: c.title, segments: c.segments, version: 2, updatedAt: now
  }))
  fs.writeFileSync(path.join(OUT_DIR, `novels_${cfg.alias}.json`), JSON.stringify(novelDoc))
  fs.writeFileSync(path.join(OUT_DIR, `novel_chapters_${cfg.alias}.json`), chLines.map(x => JSON.stringify(x)).join('\n'))
  console.log(`  → out/novels_${cfg.alias}.json · out/novel_chapters_${cfg.alias}.json`)
}

function main() {
  for (const cfg of BOOKS) buildBook(cfg)
  console.log('\n全部完成。云开发控制台 → novels / novel_chapters 集合 → 导入（Upsert）。')
}

main()
