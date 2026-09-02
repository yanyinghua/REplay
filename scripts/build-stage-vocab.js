// scripts/build-stage-vocab.js —— 构建小/初/高/大学/托福/雅思全阶段词库（含例句）
// 数据源：
//   ECDICT（释义/音标/词性/考试标签，https://github.com/skywind3000/ECDICT）
//   Tatoeba 英文例句库（scripts/cache/eng_sentences.tsv，由 fetch-examples.js 下载）
// 用法：
//   node scripts/build-stage-vocab.js
// 输出：
//   scripts/out/stage/words-*.json   词库源文件（含 example / exampleTarget）
//   scripts/out/stage/books.json     词库元数据（导入云数据库 books 集合，插入模式）
//   scripts/out/import/words-*.json  云控制台导入 words 集合的 NDJSON（插入模式）
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ECDICT = path.join(__dirname, 'cache', 'ecdict.csv')
const TSV = path.join(__dirname, 'cache', 'eng_sentences.tsv')
const STAGE = path.join(__dirname, 'out', 'stage')
const OUT = path.join(__dirname, 'out', 'import')

// ---------- 阶段词库定义 ----------
// takeTop：从该标签词表中按词频取前 N 词（小学无专门标签，取中考基础词）
const STAGE_BOOKS = [
  { bookId: 'primary', name: '小学英语', emoji: '🏫', color: '#ff922b', prefix: 'p', takeTop: 800,
    desc: '小学阶段基础词汇，覆盖日常生活高频用语', tags: ['zk'] },
  { bookId: 'junior', name: '初中英语', emoji: '📗', color: '#37b24d', prefix: 'j',
    desc: '中考大纲词汇，小升初衔接必备', tags: ['zk'] },
  { bookId: 'senior', name: '高中英语', emoji: '📘', color: '#4f6ef7', prefix: 's',
    desc: '高考大纲词汇，覆盖阅读写作高频词', tags: ['gk'] },
  { bookId: 'college', name: '大学英语', emoji: '🎓', color: '#7048e8', prefix: 'c',
    desc: '大学英语四六级核心词汇', tags: ['cet4', 'cet6'] },
  { bookId: 'toefl', name: '托福核心', emoji: '🌏', color: '#0ca678', prefix: 't',
    desc: '托福考试核心词汇，学术场景高频', tags: ['toefl'] },
  { bookId: 'ielts', name: '雅思核心', emoji: '🇬🇧', color: '#e8590c', prefix: 'i',
    desc: '雅思考试核心词汇，听说读写通用', tags: ['ielts'] }
]

// ---------- 词性映射 ----------
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
  let s = t.replace(/\[网络\]/g, '')
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

// ---------- 例句规则 ----------
const MAX_EXAMPLES = 5
const MIN_WORDS = 4
const MAX_WORDS = 16
const MAX_LEN = 120

function suffixRoots(w) {
  const out = []
  if (w.length <= 3) return out
  if (w.endsWith('ing')) { out.push(w.slice(0, -3), w.slice(0, -3) + 'e') }
  if (w.endsWith('ed')) { out.push(w.slice(0, -2), w.slice(0, -1)) }
  if (w.endsWith('es')) { out.push(w.slice(0, -2), w.slice(0, -1)) }
  if (w.endsWith('s')) { out.push(w.slice(0, -1)) }
  if (w.endsWith('d')) { out.push(w.slice(0, -1)) }
  return Array.from(new Set(out)).filter(r => r.length >= 3)
}

// ---------- 主流程 ----------
async function main() {
  if (!fs.existsSync(ECDICT)) { console.error('缺少 ' + ECDICT + '，请先运行 node scripts/fetch-ecdict.js'); process.exit(1) }
  if (!fs.existsSync(TSV)) { console.error('缺少 ' + TSV + '，请先运行 node scripts/fetch-examples.js 下载例句库'); process.exit(1) }

  console.log('[1/4] 解析 ECDICT...')
  const rows = parseCSV(fs.readFileSync(ECDICT, 'utf8'))
  const header = rows[0]
  const idx = {}
  header.forEach((h, i) => { idx[h] = i })
  console.log('  共 ' + (rows.length - 1) + ' 词条')

  // 收集每个 tag 的候选（按词频排序）
  console.log('[2/4] 提取 6 个阶段词表...')
  const reWord = /^[a-z][a-z'-]{1,39}$/i
  const reAbbr = /^[A-Z][A-Z'.]{1,5}$/
  const tagWords = {} // tag -> [{word, phonetic, meaning, tags, rank}]
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const word = (row[idx.word] || '').trim().toLowerCase()
    const translation = row[idx.translation] || ''
    if (!reWord.test(word) || word.length < 2 || /\d/.test(word)) continue
    if (reAbbr.test(word)) continue
    if (!translation) continue
    const t = (row[idx.tag] || '').trim()
    if (!t) continue
    const hitTags = t.split(/[\/\s]+/).filter(x => STAGE_BOOKS.some(b => b.tags.indexOf(x) >= 0))
    if (!hitTags.length) continue
    const frq = parseInt(row[idx.frq], 10) || 0
    const bnc = parseInt(row[idx.bnc], 10) || 0
    const item = {
      word, phonetic: row[idx.phonetic] || '',
      meaning: cleanMeaning(translation),
      posTags: posToTags(row[idx.pos] || ''),
      rank: frq > 0 ? frq : (bnc > 0 ? bnc + 100000000 : 999999999)
    }
    hitTags.forEach(tag => {
      (tagWords[tag] = tagWords[tag] || []).push(item)
    })
  }
  // 每 tag 按词频排序
  Object.keys(tagWords).forEach(tag => tagWords[tag].sort((a, b) => a.rank - b.rank))

  // 生成每本词库的词条
  const books = []
  const allWords = [] // 所有词条（用于例句匹配）
  for (const meta of STAGE_BOOKS) {
    let pool = []
    meta.tags.forEach(tag => {
      const list = tagWords[tag] || []
      if (meta.tags.length > 1) {
        // 多标签（如四六级合并）取并集去重
        const seen = new Set(pool.map(w => w.word))
        list.forEach(w => { if (!seen.has(w.word)) { seen.add(w.word); pool.push(w) } })
      } else {
        pool = list.slice()
      }
    })
    if (meta.tags.length > 1) pool.sort((a, b) => a.rank - b.rank)
    if (meta.takeTop) pool = pool.slice(0, meta.takeTop)

    const items = pool.map((w, i) => ({
      _id: 'w_' + meta.bookId + '_' + meta.prefix + String(i + 1).padStart(6, '0'),
      bookId: meta.bookId,
      id: meta.prefix + String(i + 1).padStart(6, '0'),
      spell: w.word,
      phonetic: w.phonetic ? '/' + w.phonetic + '/' : '',
      emoji: meta.emoji,
      meaning: w.meaning,
      example: '',
      exampleTarget: '',
      root: '',
      mnemonic: '',
      tags: w.posTags
    }))
    books.push({ meta, items })
    allWords.push(...items)
    console.log('  ✅ ' + meta.name + '：' + items.length + ' 词')
  }

  // 扫描 Tatoeba 匹配例句
  console.log('[3/4] 扫描例句（约 200 万句，需 1~3 分钟）...')
  const wordSet = new Set(allWords.map(it => it.spell))
  const cand = new Map()
  let scanned = 0
  const rl = readline.createInterface({ input: fs.createReadStream(TSV, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) {
    scanned++
    if (scanned % 200000 === 0) console.log('  已扫描 ' + scanned + ' 句')
    const t1 = line.indexOf('\t')
    const t2 = t1 >= 0 ? line.indexOf('\t', t1 + 1) : -1
    if (t2 < 0) continue
    const text = line.slice(t2 + 1).trim()
    if (!text || text.length > MAX_LEN) continue
    const tokens = text.match(/[a-zA-Z][a-zA-Z'-]*/g)
    if (!tokens || tokens.length < MIN_WORDS || tokens.length > MAX_WORDS) continue
    const seen = new Set()
    for (let i = 0; i < tokens.length; i++) {
      const raw = tokens[i].toLowerCase()
      let hit = wordSet.has(raw) ? raw : null
      if (!hit) {
        for (const root of suffixRoots(raw)) {
          if (wordSet.has(root)) { hit = root; break }
        }
      }
      if (!hit || seen.has(hit)) continue
      seen.add(hit)
      let list = cand.get(hit)
      if (!list) { list = []; cand.set(hit, list) }
      if (list.length >= MAX_EXAMPLES) {
        let li = 0
        for (let j = 1; j < list.length; j++) if (list[j].text.length > list[li].text.length) li = j
        if (text.length < list[li].text.length) list[li] = { text, target: raw }
      } else {
        list.push({ text, target: raw })
      }
    }
  }
  console.log('  扫描完成：' + scanned + ' 句，命中 ' + cand.size + ' 词')

  // 写回例句（每词取最短 1 条）
  console.log('[4/4] 写回例句并输出文件...')
  let matched = 0
  for (const it of allWords) {
    const list = cand.get(it.spell)
    const best = list && list.length ? list.reduce((a, b) => (a.text.length <= b.text.length ? a : b)) : null
    if (best) { it.example = best.text; it.exampleTarget = best.target; matched++ }
  }
  console.log('  例句覆盖：' + matched + '/' + allWords.length + ' 词（' + (matched / allWords.length * 100).toFixed(1) + '%）')

  fs.mkdirSync(STAGE, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })
  const bookLines = []
  for (const { meta, items } of books) {
    const content = items.map(it => JSON.stringify(it)).join('\n') + '\n'
    fs.writeFileSync(path.join(STAGE, 'words-' + meta.bookId + '.json'), content)
    fs.writeFileSync(path.join(OUT, 'words-' + meta.bookId + '.json'), content)
    bookLines.push(JSON.stringify({
      _id: meta.bookId, bookId: meta.bookId,
      name: meta.name, desc: meta.desc, emoji: meta.emoji, color: meta.color,
      wordCount: items.length, levelCount: Math.ceil(items.length / 10),
      source: 'cloud', version: 1, updatedAt: Date.now()
    }))
    console.log('  ✅ ' + meta.name + '：' + items.length + ' 词 → ' + path.basename(path.join(STAGE, 'words-' + meta.bookId + '.json')))
  }
  fs.writeFileSync(path.join(STAGE, 'books.json'), bookLines.join('\n') + '\n')
  console.log('  ✅ 元数据 → scripts/out/stage/books.json（共 ' + books.length + ' 本）')
  console.log('\n完成！下一步：')
  console.log('  1. 云开发控制台 → 数据库 → books 集合 → 导入 scripts/out/stage/books.json（插入模式）')
  console.log('  2. words 集合 → 导入 scripts/out/import/words-*.json（插入模式，逐本导入）')
  console.log('  3. 小程序词库中心即可看到 6 本新词库')
}

main().catch(e => { console.error('失败：', e); process.exit(1) })
