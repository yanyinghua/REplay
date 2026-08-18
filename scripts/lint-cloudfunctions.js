// scripts/lint-cloudfunctions.js —— 校验所有云函数源码
// 1) 对每个 cloudfunctions/**/*.js 执行 `node --check`（语法校验）
// 2) 对每个 cloudfunctions/**/*.json 执行 JSON.parse（配置合法性）
// 任一失败则退出码非 0，供 CI 作为门禁。
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..', 'cloudfunctions')

function walk(dir, exts) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, exts))
    else if (exts.includes(path.extname(entry.name))) out.push(full)
  }
  return out
}

const errors = []

for (const file of walk(ROOT, ['.js'])) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (e) {
    errors.push(`语法错误 ${path.relative(ROOT, file)}:\n${e.stderr?.toString().trim() || e.message}`)
  }
}

for (const file of walk(ROOT, ['.json'])) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    errors.push(`JSON 非法 ${path.relative(ROOT, file)}: ${e.message}`)
  }
}

if (errors.length) {
  console.error('❌ 云函数校验未通过：\n')
  for (const e of errors) console.error('• ' + e + '\n')
  process.exit(1)
}
console.log('✅ 云函数校验通过（JS 语法 + JSON 合法性）')
