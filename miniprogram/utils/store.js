// utils/store.js —— 本地存储封装（M1 单机可跑；后续可平滑切换云数据库）
const srs = require('./srs.js')

const SRS_KEY = 'srs_state'
const USER_KEY = 'user_profile'
const PROG_KEY = 'book_progress'

/* ---------- SRS 状态 ---------- */
function getSrs() { return wx.getStorageSync(SRS_KEY) || {} }
function saveSrsAll(obj) { wx.setStorageSync(SRS_KEY, obj) }
function getRecord(wordId) { return getSrs()[wordId] || null }
function saveRecord(wordId, record) {
  const all = getSrs(); all[wordId] = record; saveSrsAll(all)
}

// 对某个词评分并持久化
function gradeWord(wordId, grade) {
  const rec = srs.review(getRecord(wordId), grade)
  saveRecord(wordId, rec)
  return rec
}

// 返回到期的词 id 列表
function getDueWordIds(now) {
  now = now || Date.now()
  const all = getSrs()
  return Object.keys(all).filter(id => all[id].due <= now)
}

/* ---------- 用户档案 / 积分通关 ---------- */
function getProfile() { return wx.getStorageSync(USER_KEY) || null }
function saveProfile(p) { wx.setStorageSync(USER_KEY, p) }

function expForLevel(level) { return (level - 1) * 200 } // 每级 200 经验
function levelFromExp(exp) { return Math.floor(exp / 200) + 1 }

// 增加经验/金币，返回更新后的档案与是否升级
function addReward(exp, coin) {
  const p = getProfile()
  const before = p.level
  p.exp += exp
  p.coin += coin
  p.level = levelFromExp(p.exp)
  saveProfile(p)
  return { profile: p, leveledUp: p.level > before }
}

// 打卡：返回 { ok, streak }
function checkIn() {
  const p = getProfile()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayTs = today.getTime()
  const last = p.lastCheckin ? new Date(p.lastCheckin) : null
  let streak = p.streak || 0
  if (last) {
    const lastTs = new Date(last); lastTs.setHours(0, 0, 0, 0)
    const diff = (todayTs - lastTs.getTime()) / 86400000
    if (diff === 1) streak += 1
    else if (diff > 1) streak = 1 // 断签衰减（保留起始，不复零）
    else return { ok: false, streak } // 今天已打卡
  } else {
    streak = 1
  }
  p.streak = streak
  p.lastCheckin = Date.now()
  // 连续打卡额外奖励
  const bonus = streak * 2
  saveProfile(p)
  addReward(10 + bonus, 5)
  return { ok: true, streak }
}

/* ---------- 词库进度（关卡/星星） ---------- */
function getProgress() { return wx.getStorageSync(PROG_KEY) || {} }
function getBookProgress(bookId) { return getProgress()[bookId] || { levels: {}, learned: 0 } }

function saveLevelResult(bookId, levelIdx, stars, accuracy) {
  const all = getProgress()
  const bk = all[bookId] || { levels: {}, learned: 0 }
  const prev = bk.levels[levelIdx] || { stars: 0, bestAccuracy: 0, passed: false }
  bk.levels[levelIdx] = {
    stars: Math.max(prev.stars, stars),
    bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
    passed: prev.passed || stars > 0
  }
  all[bookId] = bk
  wx.setStorageSync(PROG_KEY, all)
  return bk
}

function markLearned(bookId, n) {
  const all = getProgress()
  const bk = all[bookId] || { levels: {}, learned: 0 }
  bk.learned = (bk.learned || 0) + n
  all[bookId] = bk
  wx.setStorageSync(PROG_KEY, all)
}

/* ---------- 错词本 ---------- */
// 返回所有“答错过”的词 id（lapses > 0）
function getWrongWordIds() {
  const all = getSrs()
  return Object.keys(all).filter(id => (all[id].lapses || 0) > 0)
}

// 错词巩固专用评分：答对则 lapses-1（清零即毕业），答错则 lapses+1
function gradeWrongMode(wordId, ok) {
  const rec = srs.review(getRecord(wordId), ok ? 5 : 0)
  if (ok && rec.lapses > 0) rec.lapses -= 1
  saveRecord(wordId, rec)
  return rec
}

// 手动移出错词本（lapses 清零，但保留 SRS 进度）
function removeFromWrong(wordId) {
  const rec = getRecord(wordId)
  if (rec) { rec.lapses = 0; saveRecord(wordId, rec) }
}

module.exports = {
  SRS_KEY, USER_KEY, PROG_KEY,
  getRecord, saveRecord, gradeWord, getDueWordIds,
  getProfile, saveProfile, addReward, checkIn,
  expForLevel, levelFromExp,
  getProgress, getBookProgress, saveLevelResult, markLearned,
  getWrongWordIds, gradeWrongMode, removeFromWrong
}
