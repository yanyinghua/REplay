// scripts/merge-novel-import.js —— 把 out/ 下 12 本整书合并成"可一键导入"的文件
// 用法：node scripts/merge-novel-import.js
// 输出（供云开发控制台数据库导入，模式选 Upsert）：
//   scripts/out/import/novels_all.json            → novels 集合（12 本书一次导入）
//   scripts/out/import/novel_chapters_all.json    → novel_chapters 集合（体积大自动按 ~5MB 拆成 part_1/part_2...）
// 说明：合并后仍按 _id 唯一；Upsert 全量重导是幂等安全的（同一 _id 覆盖，不产生重复）。
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, 'out')
const IMP = path.join(OUT, 'import')
const CHUNK_BYTES = 5 * 1024 * 1024 // 单文件阈值：超限自动拆分，规避控制台导入大小限制

const novelFiles = fs.readdirSync(OUT).filter(f => /^novels_[^.]+\.json$/.test(f)).sort()
const novels = novelFiles.map(f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')))
const knownIds = new Set(novels.map(n => n.novelId))

// 章节：逐文件按 JSONL 读入并累加（以每条记录自带的 novelId 归组，兼容文件名与 ID 写法差异）
const chapterFiles = fs.readdirSync(OUT).filter(f => /^novel_chapters_[^.]+\.json$/.test(f)).sort()
const allChapters = []
for (const f of chapterFiles) {
  const rows = fs.readFileSync(path.join(OUT, f), 'utf8').trim().split('\n').map(x => JSON.parse(x))
  allChapters.push(...rows)
}

// 自检：每本书 meta.chapterCount 与章节文件行数一致
const byNovel = {}
allChapters.forEach(c => { byNovel[c.novelId] = (byNovel[c.novelId] || 0) + 1 })
let bad = 0
for (const n of novels) {
  if (byNovel[n.novelId] !== n.chapterCount) { console.error(`✗ ${n.novelId}: meta ${n.chapterCount} 章 vs 文件 ${byNovel[n.novelId]} 章`); bad++ }
}
if (bad) process.exit(1)

function bytes(arr) { return Buffer.byteLength(arr.map(x => JSON.stringify(x)).join('\n'), 'utf8') }
function writeJsonLines(path_, arr) {
  fs.mkdirSync(path.dirname(path_), { recursive: true })
  const data = arr.map(x => JSON.stringify(x)).join('\n')
  fs.writeFileSync(path_, data)
  return Buffer.byteLength(data, 'utf8')
}

fs.mkdirSync(IMP, { recursive: true })
const nb = writeJsonLines(path.join(IMP, 'novels_all.json'), novels)
let totalCh = 0

const cb = bytes(allChapters)
if (cb <= CHUNK_BYTES) {
  totalCh = writeJsonLines(path.join(IMP, 'novel_chapters_all.json'), allChapters)
  console.log(`✓ novels_all.json            ${(nb / 1024).toFixed(1)} KB（12 本）`)
  console.log(`✓ novel_chapters_all.json    ${(totalCh / 1024 / 1024).toFixed(2)} MB（${allChapters.length} 章）`)
} else {
  // 超过阈值 → 按顺序切成多个文件（每份不超过阈值）
  const parts = []
  let cur = [], curSize = 0
  for (const c of allChapters) {
    const s = Buffer.byteLength(JSON.stringify(c), 'utf8')
    if (cur.length && curSize + s > CHUNK_BYTES) { parts.push(cur); cur = []; curSize = 0 }
    cur.push(c); curSize += s
  }
  if (cur.length) parts.push(cur)
  parts.forEach((p, i) => {
    totalCh += writeJsonLines(path.join(IMP, `novel_chapters_part_${i + 1}.json`), p)
  })
  console.log(`✓ novels_all.json            ${(nb / 1024).toFixed(1)} KB（12 本）`)
  console.log(`✓ novel_chapters_part_1~${parts.length}.json  共 ${(totalCh / 1024 / 1024).toFixed(2)} MB（${allChapters.length} 章，拆 ${parts.length} 份）`)
}
console.log('导入：云开发控制台 → novels / novel_chapters 集合 → 导入（模式选 Upsert），每次选一个文件即可。')
