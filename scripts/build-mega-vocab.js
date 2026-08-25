// scripts/build-mega-vocab.js —— 从 ECDICT 构建 10 万词云词库（导入云数据库用）
// 数据源：ECDICT（https://github.com/skywind3000/ECDICT）ecdict.csv，77 万词条
// 用法：
//   node scripts/build-mega-vocab.js
//   node scripts/build-mega-vocab.js --count 100000 --per-book 20000 --source e:/.../ecdict.csv
// 输出（scripts/out/mega/）：
//   books.json                 → 导入 books 集合（每行一个词库元数据）
//   words-megaN-0001.json      → 导入 words 集合（每 1 万词一个文件，N=书号）
const fs = require('fs')
const path = require('path')

// ---------- 参数 ----------
const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const SRC = argOf('--source', path.join(__dirname, '..', 'ECDICT', 'ecdict.csv'))
const COUNT = parseInt(argOf('--count', '100000'), 10)
const PER_BOOK = parseInt(argOf('--per-book', '20000'), 10)
const OUT = path.join(__dirname, 'out', 'mega')

// 词库主题（按词频区间分 5 本）
const BOOKS_META = [
  { bookId: 'mega1', name: '高频核心', desc: '语料库前 2 万高频词，覆盖日常 90% 用语', emoji: '🔥', color: '#ff6b6b' },
  { bookId: 'mega2', name: '常用进阶', desc: '第 2~4 万高频词，阅读写作高频词汇', emoji: '⚡', color: '#ffa94d' },
  { bookId: 'mega3', name: '中级拓展', desc: '第 4~6 万高频词，学术与媒体常用', emoji: '📗', color: '#37b24d' },
  { bookId: 'mega4', name: '高级进阶', desc: '第 6~8 万高频词，高阶阅读词汇', emoji: '📘', color: '#4f6ef7' },
  { bookId: 'mega5', name: '学术生僻', desc: '第 8~10 万词，专业与学术生僻词', emoji: '🧠', color: '#7048e8' }
]

// 词性映射（ECDICT pos -> 中文）
const POS_MAP = {
  n: '名词', v: '动词', vt: '动词', vi: '动词', a: '形容词', adj: '形容词',
  ad: '副词', adv: '副词', prep: '介词', pron: '代词', conj: '连词',
  int: '感叹词', interj: '感叹词', num: '数词', art: '冠词',
  aux: '助动词', modal: '情态动词', abbr: '缩写', det: '限定词'
}

// ---------- CSV 解析（状态机，支持引号内换行/逗号/转义引号） ----------
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// ---------- 释义清理 ----------
function cleanMeaning(t) {
  if (!t) return ''
  let s = t.replace(/\[网络\]/g, '') // 去掉低质量网络释义
  s = s.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim()
  return s
}

function posToTags(pos) {
  if (!pos) return []
  const tags = []
  pos.split(/[/,;&]/).forEach(p => {
    const key = p.replace(/\./g, '').trim().toLowerCase()
    const zh = POS_MAP[key]
    if (zh && tags.indexOf(zh) < 0) tags.push(zh)
  })
  return tags
}

// ---------- 主流程 ----------
async function main() {
  console.log(`[1/5] 读取 ${SRC} ...`)
  const text = fs.readFileSync(SRC, 'utf8')
  const rows = parseCSV(text)
  console.log(`  解析完成，共 ${rows.length - 1} 行词条`)

  // 表头映射
  const header = rows[0]
  const idx = {}
  header.forEach((h, i) => { idx[h] = i })
  const need = ['word', 'phonetic', 'translation', 'pos', 'tag', 'bnc', 'frq']
  if (need.some(k => idx[k] === undefined)) {
    console.error('表头缺少必要字段：', JSON.stringify(header))
    process.exit(1)
  }

  console.log('[2/5] 过滤 + 排序（按语料库词频）...')
  const reWord = /^[a-z][a-z'-]{1,39}$/i
  const reAbbr = /^[A-Z][A-Z'.]{1,5}$/ // 全大写缩写排除
  const list = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const word = (row[idx.word] || '').trim()
    const translation = row[idx.translation] || ''
    if (!reWord.test(word)) continue
    if (word.length < 2) continue
    if (/\d/.test(word)) continue
    if (reAbbr.test(word)) continue
    if (!translation) continue
    const frq = parseInt(row[idx.frq], 10) || 0
    const bnc = parseInt(row[idx.bnc], 10) || 0
    list.push({
      word, phonetic: row[idx.phonetic] || '',
      translation, pos: row[idx.pos] || '', tag: row[idx.tag] || '',
      frq, bnc,
      // 排序键：frq 优先，bnc 兜底，无词频排最后
      rank: frq > 0 ? frq : (bnc > 0 ? bnc + 100000000 : 999999999)
    })
  }
  list.sort((a, b) => a.rank - b.rank)
  const picked = list.slice(0, COUNT)
  console.log(`  可用词条 ${list.length}，取前 ${picked.length} 个`)

  const books = Math.ceil(picked.length / PER_BOOK)
  console.log(`[3/5] 分成 ${books} 本词库（每本 ${PER_BOOK} 词）...`)
  const CHUNK_FILE = 10000
  fs.mkdirSync(OUT, { recursive: true })

  const bookMeta = []
  let total = 0
  for (let b = 0; b < books; b++) {
    const meta = BOOKS_META[b] || {
      bookId: `mega${b + 1}`, name: `词库${b + 1}`, desc: '',
      emoji: '📖', color: '#4f6ef7'
    }
    const seg = picked.slice(b * PER_BOOK, (b + 1) * PER_BOOK)
    bookMeta.push({
      _id: meta.bookId, bookId: meta.bookId,
      name: meta.name, desc: meta.desc, emoji: meta.emoji, color: meta.color,
      wordCount: seg.length, levelCount: Math.ceil(seg.length / 10),
      source: 'cloud', version: 1, updatedAt: Date.now()
    })

    // 每 1 万词写一个文件
    for (let s = 0; s < seg.length; s += CHUNK_FILE) {
      const chunk = seg.slice(s, s + CHUNK_FILE)
      const part = String(Math.floor(s / CHUNK_FILE) + 1).padStart(2, '0')
      const file = path.join(OUT, `words-${meta.bookId}-${part}.json`)
      const lines = chunk.map((w, i) => {
        const gid = (b * PER_BOOK + s + i + 1) // 全局唯一 id
        return JSON.stringify({
          _id: `w_${meta.bookId}_m${String(gid).padStart(6, '0')}`,
          bookId: meta.bookId,
          id: `m${String(gid).padStart(6, '0')}`,
          spell: w.word,
          phonetic: w.phonetic ? `/${w.phonetic}/` : '',
          emoji: meta.emoji,
          meaning: cleanMeaning(w.translation),
          example: '', root: '', mnemonic: '',
          tags: posToTags(w.pos)
        })
      })
      fs.writeFileSync(file, lines.join('\n'))
      console.log(`  ✅ ${path.basename(file)}  ${lines.length} 条`)
    }
    total += seg.length
  }

  fs.writeFileSync(path.join(OUT, 'books.json'), bookMeta.map(JSON.stringify).join('\n'))
  console.log(`[4/5] 元数据写入 books.json（${bookMeta.length} 本）`)
  console.log(`[5/5] 完成：共 ${total} 词条 → ${OUT}`)
}

main().catch(e => { console.error('失败：', e); process.exit(1) })
