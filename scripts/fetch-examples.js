// scripts/fetch-examples.js —— 从 Tatoeba 开源例句库为词库匹配英文例句
// 数据源：Tatoeba 英文句子导出（约 23MB / 200 万句）
//   https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2
// 用法：
//   node scripts/fetch-examples.js
// 流程：
//   1. 下载并解压 eng_sentences.tsv.bz2（缓存到 scripts/cache/）
//   2. 扫描句子，为 scripts/out/mega/ 的每个单词匹配「包含原形」的例句
//   3. 例句写回 mega 源文件，并同步生成 scripts/out/import/ 云控制台导入文件
const fs = require('fs')
const path = require('path')
const https = require('https')
const readline = require('readline')
const { spawnSync } = require('child_process')

const URL = 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2'
const CACHE = path.join(__dirname, 'cache')
const MEGA = path.join(__dirname, 'out', 'mega')
const OUT = path.join(__dirname, 'out', 'import')
const TSV = path.join(CACHE, 'eng_sentences.tsv')
const BZ2 = TSV + '.bz2'

const MAX_EXAMPLES = 5          // 每个词最多保留的候选数（最后取最短 1 条）
const MIN_WORDS = 4             // 例句最少单词数（太短没教学意义）
const MAX_WORDS = 16            // 例句最多单词数
const MAX_LEN = 120             // 例句最长字符数

// 剥离常见规则后缀还原词根（ing/ed/es/s/d），供匹配例句用
function suffixRoots(w) {
  const out = []
  if (w.length <= 3) return out
  if (w.endsWith('ing')) { out.push(w.slice(0, -3), w.slice(0, -3) + 'e') } // singing→sing/singe
  if (w.endsWith('ed')) { out.push(w.slice(0, -2), w.slice(0, -1)) }        // walked→walk/walke→walk? liked→lik/like
  if (w.endsWith('es')) { out.push(w.slice(0, -2), w.slice(0, -1)) }        // watches→watch, boxes→box
  if (w.endsWith('s')) { out.push(w.slice(0, -1)) }                         // books→book
  if (w.endsWith('d')) { out.push(w.slice(0, -1)) }                         // decided→decide
  return Array.from(new Set(out)).filter(r => r.length >= 3)
}

// ---------- 下载 ----------
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req = https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        req.destroy()
        return download(res.headers.location, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        return reject(new Error('HTTP ' + res.statusCode))
      }
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let got = 0
      res.on('data', c => {
        got += c.length
        if (total) process.stdout.write(`\r  下载中 ${(got / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`)
      })
      res.pipe(file)
      file.on('finish', () => { file.close(resolve) })
    })
    req.on('error', e => { try { fs.unlinkSync(dest) } catch (err) {}; reject(e) })
  })
}

// ---------- 解压 bz2（Windows / macOS / Linux 均可用 tar） ----------
function extract() {
  console.log('  解压中...')
  const r = spawnSync('tar', ['-xf', BZ2, '-C', CACHE], { encoding: 'utf8' })
  if (r.status !== 0 || !fs.existsSync(TSV)) {
    throw new Error('tar 解压失败：' + (r.stderr || '未知错误') + '\n请手动解压 ' + BZ2 + ' 为 ' + TSV + ' 后重新运行')
  }
}

// ---------- 读取词库（NDJSON 每行一个对象） ----------
function loadWords() {
  const files = fs.readdirSync(MEGA).filter(f => /^words-.*\.json$/.test(f))
  const items = []
  for (const f of files) {
    const lines = fs.readFileSync(path.join(MEGA, f), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    lines.forEach((l, i) => {
      try {
        const obj = JSON.parse(l)
        items.push({ file: f, line: i, lower: String(obj.spell || '').toLowerCase(), obj })
      } catch (e) {
        console.warn(`  ⚠️ 跳过 ${f} 第 ${i + 1} 行（JSON 解析失败）`)
      }
    })
  }
  return { files, items }
}

// ---------- 主流程 ----------
async function main() {
  // 1. 数据准备
  if (!fs.existsSync(TSV)) {
    if (!fs.existsSync(BZ2)) {
      console.log('[1/4] 下载 Tatoeba 英文例句（约 23MB）...')
      fs.mkdirSync(CACHE, { recursive: true })
      try {
        await download(URL, BZ2)
      } catch (e) {
        console.error('  下载失败：', e.message)
        console.error('  可手动下载后重试：' + URL)
        process.exit(1)
      }
      console.log('\n  下载完成')
    }
    extract()
  }

  // 2. 读词库
  console.log('[2/4] 读取词库...')
  const { files, items } = loadWords()
  const wordSet = new Set(items.map(it => it.lower))
  console.log(`  共 ${items.length} 个单词，${files.length} 个文件`)

  // 3. 扫描句子匹配
  console.log('[3/4] 扫描例句（约 200 万句，需要 1~3 分钟）...')
  const cand = new Map() // lower -> [{text, target}...]
  let scanned = 0
  const rl = readline.createInterface({ input: fs.createReadStream(TSV, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) {
    scanned++
    if (scanned % 200000 === 0) console.log(`  已扫描 ${scanned} 句`)
    // 格式：id<TAB>lang<TAB>text
    const t1 = line.indexOf('\t')
    const t2 = t1 >= 0 ? line.indexOf('\t', t1 + 1) : -1
    if (t2 < 0) continue
    const text = line.slice(t2 + 1).trim()
    if (!text || text.length > MAX_LEN) continue
    const tokens = text.match(/[a-zA-Z][a-zA-Z'-]*/g)
    if (!tokens || tokens.length < MIN_WORDS || tokens.length > MAX_WORDS) continue
    // 为句中每个命中词库的词记录例句：精确原形优先，其次去规则后缀还原词根
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
        // 比当前最长候选更短则替换，保证优先短句
        let li = 0
        for (let j = 1; j < list.length; j++) if (list[j].text.length > list[li].text.length) li = j
        if (text.length < list[li].text.length) list[li] = { text, target: raw }
      } else {
        list.push({ text, target: raw })
      }
    }
  }
  console.log(`  扫描完成：${scanned} 句，命中 ${cand.size} 个单词`)

  // 4. 写回例句（每词取最短 1 条，同时记录例句中实际词形用于精确挖空）
  console.log('[4/4] 写回例句...')
  let matched = 0
  for (const it of items) {
    const list = cand.get(it.lower)
    const best = list && list.length ? list.reduce((a, b) => (a.text.length <= b.text.length ? a : b)) : null
    if (best) {
      it.obj.example = best.text
      it.obj.exampleTarget = best.target
      matched++
    } else {
      it.obj.example = ''
      it.obj.exampleTarget = ''
    }
  }

  // 写回 mega 源文件
  const byFile = {}
  items.forEach(it => { (byFile[it.file] = byFile[it.file] || []).push(it) })
  for (const f of files) {
    const arr = byFile[f] || []
    arr.sort((a, b) => a.line - b.line)
    fs.writeFileSync(path.join(MEGA, f), arr.map(it => JSON.stringify(it.obj)).join('\n') + '\n', 'utf8')
  }

  // 同步生成云控制台导入文件（NDJSON）
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  for (const f of files) {
    const arr = byFile[f] || []
    arr.sort((a, b) => a.line - b.line)
    fs.writeFileSync(path.join(OUT, f), arr.map(it => JSON.stringify(it.obj)).join('\n') + '\n', 'utf8')
  }
  console.log(`  例句匹配 ${matched}/${items.length} 词（${(matched / items.length * 100).toFixed(1)}%）`)
  console.log('  已更新 scripts/out/mega/ 与 scripts/out/import/')
  console.log('  下一步：把 scripts/out/import/words-*.json 重新导入云数据库 words 集合（选择“覆盖模式”）')
}

main().catch(e => { console.error('失败：', e); process.exit(1) })
