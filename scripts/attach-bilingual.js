// scripts/attach-bilingual.js —— 为 scripts/out/stage/words-*.json 词库补配「中英双语」例句
// 数据源（Tatoeba 开源语料，CC-BY）：
//   scripts/cache/eng_sentences.tsv      英文句子  id<TAB>eng<TAB>text（约 200 万句）
//   scripts/cache/cmn_sentences.tsv      中文句子  id<TAB>cmn<TAB>text（约 8.9 万句）
//   scripts/cache/cmn-eng_links.tsv      中英翻译链接  cmnId<TAB>engId（约 7.8 万对）
//   scripts/cache/STCharacters.txt       OpenCC 繁→简 单字映射（Apache-2.0）
// 用法：node scripts/attach-bilingual.js
// 效果：命中的词 → example=英文句、exampleZh=中文翻译、exampleTarget=句中原形
//       未命中的词 → exampleZh=''，保留原有英文例句
// 输出：覆盖 scripts/out/stage/words-*.json 与 scripts/out/import/words-*.json（NDJSON）
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const CACHE = path.join(__dirname, 'cache')
const STAGE = path.join(__dirname, 'out', 'stage')
const OUT = path.join(__dirname, 'out', 'import')
const ENG_TSV = path.join(CACHE, 'eng_sentences.tsv')
const CMN_TSV = path.join(CACHE, 'cmn_sentences.tsv')
const LINK_TSV = path.join(CACHE, 'cmn-eng_links.tsv')
const ST_CHARS = path.join(CACHE, 'TSCharacters.txt')

const MAX_CAND = 5
const MIN_WORDS = 4
const MAX_WORDS = 16
const MAX_LEN = 120
const MAX_ZH_LEN = 80

// ---------- 繁→简 字符映射 ----------
function loadSimplifier() {
  const map = new Map()
  if (!fs.existsSync(ST_CHARS)) return null
  const lines = fs.readFileSync(ST_CHARS, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    if (!line || line[0] === '#') continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const k = line.slice(0, tab)
    const v = line.slice(tab + 1).split(' ')[0]
    if (k && v && k !== v) map.set(k, v)
  }
  console.log('  繁→简映射：' + map.size + ' 字')
  return ch => {
    let out = ''
    for (const c of ch) out += map.get(c) || c
    return out
  }
}

// ---------- 词形还原（供匹配例句用） ----------
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

// ---------- 读 NDJSON 词库 ----------
function loadWords() {
  const files = fs.readdirSync(STAGE).filter(f => /^words-.*\.json$/.test(f)).sort()
  const items = []
  for (const f of files) {
    const lines = fs.readFileSync(path.join(STAGE, f), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    lines.forEach((l, i) => {
      try {
        const obj = JSON.parse(l)
        items.push({ file: f, line: i, lower: String(obj.spell || '').toLowerCase(), obj })
      } catch (e) {
        console.warn('  跳过 ' + f + ' 第 ' + (i + 1) + ' 行（JSON 解析失败）')
      }
    })
  }
  return { files, items }
}

// ---------- 主流程 ----------
async function main() {
  for (const f of [ENG_TSV, CMN_TSV, LINK_TSV]) {
    if (!fs.existsSync(f)) { console.error('缺少 ' + f + '\n请先运行 node scripts/tmp-bilingual-probe.js 下载双语数据'); process.exit(1) }
  }

  console.log('[1/5] 加载繁→简映射...')
  const toSimp = loadSimplifier()

  console.log('[2/5] 读取中文句子与中英链接...')
  const cmnText = fs.readFileSync(CMN_TSV, 'utf8').split(/\r?\n/)
  const zhById = new Map()
  for (const line of cmnText) {
    if (!line) continue
    const t1 = line.indexOf('\t')
    const t2 = t1 >= 0 ? line.indexOf('\t', t1 + 1) : -1
    if (t2 < 0) continue
    const id = line.slice(0, t1)
    let text = line.slice(t2 + 1).trim()
    if (!text) continue
    if (toSimp) text = toSimp(text)
    if (text.length > MAX_ZH_LEN) continue
    zhById.set(id, text)
  }
  console.log('  中文句：' + zhById.size + ' 条')
  const zhByEng = new Map() // engId -> 中文（首个翻译）
  const links = fs.readFileSync(LINK_TSV, 'utf8').split(/\r?\n/)
  for (const line of links) {
    if (!line) continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const cmnId = line.slice(0, tab)
    const engId = line.slice(tab + 1)
    if (!zhByEng.has(engId) && zhById.has(cmnId)) zhByEng.set(engId, zhById.get(cmnId))
  }
  console.log('  有中文翻译的英文句：' + zhByEng.size + ' 条')

  console.log('[3/5] 读取词库...')
  const { files, items } = loadWords()
  const wordSet = new Set(items.map(it => it.lower))
  console.log('  共 ' + items.length + ' 词，' + files.length + ' 本')

  console.log('[4/5] 扫描双语英文句（仅对有中文翻译的句子做词匹配）...')
  const cand = new Map() // lower -> [{text,target,zh}]
  let scanned = 0, useful = 0
  const rl = readline.createInterface({ input: fs.createReadStream(ENG_TSV, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) {
    scanned++
    if (scanned % 200000 === 0) console.log('  已扫描 ' + scanned + ' 句')
    const t1 = line.indexOf('\t')
    const t2 = t1 >= 0 ? line.indexOf('\t', t1 + 1) : -1
    if (t2 < 0) continue
    const id = line.slice(0, t1)
    const zh = zhByEng.get(id)
    if (!zh) continue // 只有无中文翻译的句子直接跳过
    const text = line.slice(t2 + 1).trim()
    if (!text || text.length > MAX_LEN) continue
    const tokens = text.match(/[a-zA-Z][a-zA-Z'-]*/g)
    if (!tokens || tokens.length < MIN_WORDS || tokens.length > MAX_WORDS) continue
    const seen = new Set()
    let matchedAny = false
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
      matchedAny = true
      let list = cand.get(hit)
      if (!list) { list = []; cand.set(hit, list) }
      if (list.length >= MAX_CAND) {
        let li = 0
        for (let j = 1; j < list.length; j++) if (list[j].text.length > list[li].text.length) li = j
        if (text.length < list[li].text.length) list[li] = { text, target: raw, zh }
      } else {
        list.push({ text, target: raw, zh })
      }
    }
    if (matchedAny) useful++
  }
  console.log('  扫描完成：' + scanned + ' 句，其中 ' + useful + ' 句命中词库，命中 ' + cand.size + ' 个词')

  console.log('[5/5] 写回双语例句...')
  let matched = 0
  for (const it of items) {
    const list = cand.get(it.lower)
    const best = list && list.length ? list.reduce((a, b) => (a.text.length <= b.text.length ? a : b)) : null
    if (best) {
      it.obj.example = best.text
      it.obj.exampleTarget = best.target
      it.obj.exampleZh = best.zh
      matched++
    } else {
      it.obj.exampleZh = ''
    }
  }
  const byFile = {}
  items.forEach(it => { (byFile[it.file] = byFile[it.file] || []).push(it) })
  fs.mkdirSync(OUT, { recursive: true })
  let total = 0
  for (const f of files) {
    const arr = byFile[f] || []
    arr.sort((a, b) => a.line - b.line)
    const content = arr.map(it => JSON.stringify(it.obj)).join('\n') + '\n'
    fs.writeFileSync(path.join(STAGE, f), content)
    fs.writeFileSync(path.join(OUT, f), content)
    const bookMatched = arr.filter(it => it.obj.exampleZh).length
    total += bookMatched
    const bookName = (arr[0] && arr[0].obj && arr[0].obj.bookId) || f
    console.log('  ' + bookName + '：双语 ' + bookMatched + '/' + arr.length)
  }
  console.log('\n双语覆盖 ' + matched + '/' + items.length + ' 词（' + (matched / items.length * 100).toFixed(1) + '%）')
  console.log('已更新 scripts/out/stage/ 与 scripts/out/import/')
  console.log('下一步：把 scripts/out/import/words-*.json 以「覆盖」模式重新导入云数据库 words 集合')
}

main().catch(e => { console.error('失败：', e); process.exit(1) })
