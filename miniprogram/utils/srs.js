// utils/srs.js —— 间隔重复核心（SM-2 简化版）
// 参考：SuperMemo SM-2。grade 取值 0(忘记) / 3(模糊) / 5(熟记)
const DAY = 24 * 60 * 60 * 1000

function emptyRecord() {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now(), lastReview: 0 }
}

// 复习一次，返回更新后的记录
function review(record, grade) {
  record = Object.assign(emptyRecord(), record || {})
  if (grade < 3) {
    // 遗忘：重置，立即重学
    record.lapses += 1
    record.reps = 0
    record.interval = 0
    record.due = Date.now()
  } else {
    record.reps += 1
    if (record.reps === 1) record.interval = 1
    else if (record.reps === 2) record.interval = 6
    else record.interval = Math.round(record.interval * record.ease)
    record.due = Date.now() + record.interval * DAY
  }
  // 调整难度因子
  record.ease = record.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  if (record.ease < 1.3) record.ease = 1.3
  record.lastReview = Date.now()
  return record
}

// 是否到期需要复习
function isDue(record, now) {
  if (!record) return false
  return record.due <= (now || Date.now())
}

// 距离下次复习的描述
function nextIntervalText(record) {
  if (!record || record.interval <= 0) return '待巩固'
  const d = record.interval
  if (d < 1) return '今天'
  if (d < 30) return d + ' 天后'
  if (d < 365) return Math.round(d / 30) + ' 个月后'
  return Math.round(d / 365) + ' 年后'
}

module.exports = { DAY, emptyRecord, review, isDue, nextIntervalText }
