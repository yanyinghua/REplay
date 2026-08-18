// utils/retention.js —— 记忆留存 / 遗忘曲线推演
// 模型：单个词在距上次复习 t 天、间隔 I 天时的留存率 R = 0.9^(t/I)
// （即到“到期日” I 天时留存约 90%，之后继续衰减——若不复习）
const srs = require('./srs.js')
const DAY = srs.DAY

// 单个词的当前留存率 (0~1)
function wordRetention(record, now) {
  if (!record || !record.lastReview) return 0
  if (record.reps === 0) return 0.4 // 刚答错/未巩固，视为偏低
  const t = (now - record.lastReview) / DAY
  if (t <= 0) return 1
  const I = Math.max(record.interval, 0.5)
  return Math.pow(0.9, t / I)
}

// 整体当前留存率 (0~1)
function overallRetention(srsState, now) {
  const ids = Object.keys(srsState || {})
  if (!ids.length) return 1
  let sum = 0
  ids.forEach(id => { sum += wordRetention(srsState[id], now) })
  return sum / ids.length
}

// 未来 days 天、若不再复习的平均留存曲线 (数组，长度 days+1)
function projection(srsState, days, now) {
  const ids = Object.keys(srsState || {})
  const pts = []
  for (let d = 0; d <= days; d++) {
    const t = now + d * DAY
    if (!ids.length) { pts.push(1); continue }
    let sum = 0
    ids.forEach(id => { sum += wordRetention(srsState[id], t) })
    pts.push(sum / ids.length)
  }
  return pts
}

module.exports = { wordRetention, overallRetention, projection }
