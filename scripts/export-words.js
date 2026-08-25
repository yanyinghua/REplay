// scripts/export-words.js —— 把内置词库导出为云数据库导入格式（控制台一键导入）
// 用法：
//   node scripts/export-words.js
// 生成：
//   scripts/out/books.json            → 导入 books 集合（词库元数据）
//   scripts/out/words-<bookId>.json   → 导入 words 集合（每个词库一个文件）
// 导入步骤（微信开发者工具 → 云开发控制台 → 数据库）：
//   1. 新建集合 books、words
//   2. books 集合 → 导入 → 选择 scripts/out/books.json（格式：JSON）
//   3. words 集合 → 导入 → 依次选择 scripts/out/words-*.json
//   4. 两个集合权限均设为「所有用户可读，仅创建者可写」（云函数写入不受影响）
// 备注：也可用于把外部词表 JSON（[{id,spell,meaning,...}]）转成导入格式：
//   node scripts/export-words.js --custom ./my-vocab.json --bookId cet6 --name "六级词汇" --desc "大学英语六级"
const fs = require('fs')
const path = require('path')
const words = require('../miniprogram/data/words.js')

const OUT = path.join(__dirname, 'out')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

// ---------- 外部词表模式 ----------
const args = process.argv.slice(2)
const customIdx = args.indexOf('--custom')
if (customIdx >= 0) {
  const src = args[customIdx + 1]
  const bookId = (args[args.indexOf('--bookId') + 1]) || 'custom'
  const name = (args[args.indexOf('--name') + 1]) || bookId
  const desc = (args[args.indexOf('--desc') + 1]) || ''
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'))
  const list = raw.map((w, i) => Object.assign({
    id: w.id || `${bookId}${String(i + 1).padStart(4, '0')}`,
    spell: w.spell || w.word,
    phonetic: w.phonetic || '',
    emoji: w.emoji || '',
    meaning: w.meaning || w.trans || '',
    example: w.example || '',
    root: w.root || '',
    mnemonic: w.mnemonic || ''
  }, w.tags ? { tags: w.tags } : {}))
  const book = { _id: bookId, bookId, name, desc, emoji: '📖', color: '#4f6ef7', wordCount: list.length, levelCount: Math.ceil(list.length / 10), source: 'cloud', version: 1, updatedAt: Date.now() }
  fs.writeFileSync(path.join(OUT, 'books-custom.json'), JSON.stringify(book))
  fs.writeFileSync(path.join(OUT, `words-${bookId}.json`), list.map(JSON.stringify).join('\n'))
  console.log(`✅ 外部词表已导出：${bookId}（${list.length} 词）→ scripts/out/`)
  console.log('   将 books-custom.json 内容合并进 books.json 后导入')
  return
}

// ---------- 内置词库模式 ----------
const books = words.BOOKS.map(b => ({
  _id: b.bookId,
  bookId: b.bookId,
  name: b.name,
  desc: b.desc,
  emoji: b.emoji,
  color: b.color,
  wordCount: words.getWords(b.bookId).length,
  levelCount: words.getLevelCount(b.bookId),
  source: 'builtin',
  version: 1,
  updatedAt: Date.now()
}))
fs.writeFileSync(path.join(OUT, 'books.json'), books.map(JSON.stringify).join('\n'))

let total = 0
words.BOOKS.forEach(b => {
  const list = words.getWords(b.bookId).map(w => ({
    _id: `w_${b.bookId}_${w.id}`,
    bookId: b.bookId,
    id: w.id,
    spell: w.spell,
    phonetic: w.phonetic,
    emoji: w.emoji,
    meaning: w.meaning,
    example: w.example,
    root: w.root,
    mnemonic: w.mnemonic,
    tags: w.tags || []
  }))
  total += list.length
  fs.writeFileSync(path.join(OUT, `words-${b.bookId}.json`), list.map(JSON.stringify).join('\n'))
  console.log(`✅ words-${b.bookId}.json  ${list.length} 条`)
})
console.log(`✅ books.json  ${books.length} 本`)
console.log(`共导出 ${total} 词条 → scripts/out/`)
