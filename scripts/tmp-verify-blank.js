// 临时验证：模拟 quiz.js 挖空逻辑
const words = [
  ['subvert', 'subverting', 'We love subverting norms.'],
  ['be', 'be', 'May it be so!'],
  ['go', 'go', 'I have to go to sleep.'],
  ['watch', 'watches', 'He watches the stars.'],
  ['book', 'books', 'I read books every day.']
]
for (const [spell, target, example] of words) {
  const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const out = example.replace(new RegExp('\\b' + esc + '\\b', 'gi'), ' ____ ')
  const ok = out.indexOf(' ____ ') >= 0
  console.log((ok ? 'OK ' : 'FAIL ') + spell.padEnd(8) + ' => ' + out)
}
