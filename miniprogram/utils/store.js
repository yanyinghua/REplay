// utils/store.js —— 本地存储封装（M1 单机可跑；M3 已接入云存档 user-sync 自动互备）
const srs = require('./srs.js')
const sync = require('./sync.js')

const SRS_KEY = 'srs_state'
const USER_KEY = 'user_profile'
const PROG_KEY = 'book_progress'

/* ---------- SRS 状态 ---------- */
function getSrs() { return wx.getStorageSync(SRS_KEY) || {} }
function saveSrsAll(obj) { wx.setStorageSync(SRS_KEY, obj) }
function getRecord(wordId) { return getSrs()[wordId] || null }
function saveRecord(wordId, record) {
  const all = getSrs(); all[wordId] = record; saveSrsAll(all)
  sync.notify() // 记忆状态变更 → 防抖上云
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
function saveProfile(p) {
  wx.setStorageSync(USER_KEY, p)
  sync.notify() // 等级/经验/打卡变更 → 上云
}

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
/* ---------- 兴趣标签（首页热点推荐用；随 user_profile 云同步） ---------- */
function getInterestTags() {
  const p = getProfile()
  return (p && Array.isArray(p.interest_tags)) ? p.interest_tags.slice() : []
}
function setInterestTags(ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : []
  const p = getProfile() || { exp: 0, level: 1, coin: 0, streak: 0, lastCheckin: 0, badges: [], createdAt: Date.now() }
  p.interest_tags = list
  saveProfile(p)
  return list
}

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
  sync.notify() // 关卡进度变更 → 上云
  return bk
}

function markLearned(bookId, n) {
  const all = getProgress()
  const bk = all[bookId] || { levels: {}, learned: 0 }
  bk.learned = Math.max(0, (bk.learned || 0) + n)
  all[bookId] = bk
  wx.setStorageSync(PROG_KEY, all)
  if (n > 0) addDailyLearned(n)   // 记录每日学习量（解锁扣减不影响今日）
  sync.notify() // 已学数变更 → 上云
}

/* ---------- 每日学习统计 ---------- */
const DAILY_KEY = 'daily_learn'
function todayKey() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function getDailyLearnedMap() { return wx.getStorageSync(DAILY_KEY) || {} }
function addDailyLearned(n) {
  if (!n) return
  const all = getDailyLearnedMap()
  const k = todayKey()
  all[k] = (all[k] || 0) + n
  wx.setStorageSync(DAILY_KEY, all)
}
function getTodayLearned() { return getDailyLearnedMap()[todayKey()] || 0 }
// 近 N 天每日已学（用于图表），返回 [{ date: 'MM-DD', count }]
function getRecentDaily(n) {
  const all = getDailyLearnedMap()
  const list = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    list.push({ date: String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), count: all[key] || 0 })
  }
  return list
}

/* ---------- 操作手设置（学习按钮左右布局） ---------- */
const HAND_KEY = 'hand_mode'
function getHandMode() { return wx.getStorageSync(HAND_KEY) || 'right' }
function setHandMode(mode) {
  wx.setStorageSync(HAND_KEY, mode === 'left' ? 'left' : 'right')
  sync.notify() // 设置变更 → 上云
}

/* ---------- 「继续学习」断点位置 ---------- */
function saveLastPos(pos) { sync.saveLastPos(pos) }
function loadLastPos() { return sync.loadLastPos() }
function clearLastPos() { sync.clearLastPos() }

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
  getWrongWordIds, gradeWrongMode, removeFromWrong,
  getHandMode, setHandMode,
  getInterestTags, setInterestTags,
  saveLastPos, loadLastPos, clearLastPos,
  getTodayLearned, getRecentDaily
}
