// scripts/convert-mega-json.js —— 把原始词库文件规范化为云开发控制台可导入的 JSON Lines 格式
// 输入：scripts/out/mega/*.json（每行一个 JSON 对象）
// 输出：scripts/out/import/*.json（每行一个 JSON 对象，符合云开发控制台导入要求）
// 用法：node scripts/convert-mega-json.js
const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, 'out', 'mega')
const outDir = path.join(__dirname, 'out', 'import')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json'))
let totalWords = 0

files.forEach(f => {
  const lines = fs.readFileSync(path.join(srcDir, f), 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  // 校验每一行都是合法 JSON
  const normalized = lines.map(l => JSON.stringify(JSON.parse(l))).join('\n')
  fs.writeFileSync(path.join(outDir, f), normalized + '\n', 'utf8')
  totalWords += lines.length
  console.log(`✅ ${f} -> ${lines.length} 条 (${(fs.statSync(path.join(outDir, f)).size / 1024 / 1024).toFixed(2)}MB)`)
})

console.log(`\n共 ${files.length} 个文件，${totalWords} 条，已输出到 scripts/out/import/`)
