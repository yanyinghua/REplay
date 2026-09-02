// utils/sync.js —— 学习存档云端互备（配合云函数 user-sync）
// 覆盖内容：
//   - profile(等级/经验/金币/打卡) + book_progress(关卡星/通关/已学数) + hand_mode → meta
//   - srs_state（记忆时间表，词量大）→ 按词 id 哈希拆 4 桶
//   - learned_words_<bookId>（已学词表，用于「跳过已学」与选词锁定）→ 按词库 id 哈希拆 4 桶
// 触发时机：
//   - 任何写入口调用 notify()，内部 2.5s 防抖后整包上传（幂等覆盖）
//   - app 启动时若本地是「全新状态」且有云端存档 → 自动恢复（覆盖重装/换设备场景）
//   双设备同时使用且本地都有数据 → 合并双方（取各自较新的词条/更高的星与数）
// 安全：所有写操作都走本地优先，云同步失败不影响学习（静默降级）
const CLOUD_FN = 'user-sync'

const SRS_KEY = 'srs_state'
const USER_KEY = 'user_profile'
const PROG_KEY = 'book_progress'
const HAND_KEY = 'hand_mode'
const TAG_KEY = 'sync_last_at'        // 上次成功全量上传时间戳
const LASTPOS_KEY = 'last_learn_pos'  // 「继续学习」断点位置
const SRS_BUCKETS = 4

let timer = null
let openidPromise = null
let enabled = true

/* ---------- 基础能力 ---------- */
function cloudReady() {
  return !!(wx.cloud && wx.cloud.callFunction)
}

function fetchOpenid() {
  if (!cloudReady()) return Promise.resolve('')
  if (openidPromise) return openidPromise
  openidPromise = wx.cloud.callFunction({ name: 'login' })
    .then(r => {
      const oid = (r.result && r.result.openid) || ''
      if (oid) {
        try { getApp().globalData.openid = oid } catch (e) {}
        return oid
      }
      openidPromise = null // 未取到 openid 允许下次重试
      return ''
    })
    .catch(() => {
      openidPromise = null // 失败允许下次重试
      return ''
    })
  return openidPromise
}

function callFn(data) {
  if (!cloudReady()) return Promise.reject(new Error('cloud disabled'))
  return wx.cloud.callFunction({ name: CLOUD_FN, data }).then(r => (r.result || {}))
}

function bucketOf(str) {
  let sum = 0
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i)
  return sum % SRS_BUCKETS
}

function splitBuckets(keys, fnBucket) {
  const buckets = []
  for (let i = 0; i < SRS_BUCKETS; i++) buckets.push({})
  keys.forEach(k => buckets[fnBucket(k)][k] = true)
  return buckets
}

/* ---------- 采集本地状态 ---------- */
function localMeta() {
  let mybox = []
  try { mybox = wx.getStorageSync('mybox_words') || [] } catch (e) {}
  return {
    profile: wx.getStorageSync(USER_KEY) || null,
    progress: wx.getStorageSync(PROG_KEY) || null,
    hand: wx.getStorageSync(HAND_KEY) || 'right',
    mybox: mybox
  }
}

function localSrs() {
  return wx.getStorageSync(SRS_KEY) || {}
}

function learnedBooks() {
  const books = {}
  try {
    const info = wx.getStorageInfoSync()
    ;(info.keys || []).forEach(k => {
      const m = /^learned_words_(.+)$/.exec(k)
      if (m) books[m[1]] = wx.getStorageSync(k) || []
    })
  } catch (e) {}
  return books
}

// 本地是否「有学习痕迹」（用于判断是否全新设备）
function hasLocalData() {
  const srs = localSrs()
  if (Object.keys(srs).length) return true
  const p = wx.getStorageSync(USER_KEY)
  if (p && ((p.exp || 0) > 0 || (p.streak || 0) > 0)) return true
  const prog = wx.getStorageSync(PROG_KEY)
  if (prog && Object.keys(prog).length) return true
  try {
    const info = wx.getStorageInfoSync()
    if ((info.keys || []).some(k => /^learned_words_/.test(k))) return true
  } catch (e) {}
  return false
}

/* ---------- 上传（防抖） ---------- */
function notify() {
  if (!enabled) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, 2500)
}

async function flush() {
  if (!enabled) return
  if (timer) { clearTimeout(timer); timer = null }
  const oid = await fetchOpenid()
  if (!oid) return
  const now = Date.now()
  let metaOk = false
  // 1) meta（profile + progress + hand）
  try {
    const r = await callFn({ action: 'pushMeta', meta: localMeta(), updatedAt: now })
    metaOk = !!(r && r.ok)
  } catch (e) { console.warn('[sync] pushMeta 失败', e) }
  // 2) srs 桶
  const srs = localSrs()
  const srsKeys = Object.keys(srs)
  if (srsKeys.length) {
    const bs = splitBuckets(srsKeys, bucketOf)
    await Promise.all(bs.map((m, b) => {
      const map = {}
      Object.keys(m).forEach(k => map[k] = srs[k])
      return callFn({ action: 'pushSrs', bucket: b, map, updatedAt: now }).catch(e => console.warn('[sync] pushSrs', b, '失败', e))
    }))
  }
  // 3) learned 桶
  const books = learnedBooks()
  const bookKeys = Object.keys(books)
  if (bookKeys.length) {
    const bs = splitBuckets(bookKeys, bucketOf)
    await Promise.all(bs.map((m, b) => {
      const map = {}
      Object.keys(m).forEach(k => map[k] = books[k])
      return callFn({ action: 'pushLearned', bucket: b, books: map, updatedAt: now }).catch(e => console.warn('[sync] pushLearned', b, '失败', e))
    }))
  }
  if (metaOk) wx.setStorageSync(TAG_KEY, now)
}

/* ---------- 合并规则 ---------- */
function maxRec(a, b) {
  if (!a) return b
  if (!b) return a
  return ((b.lastReview || 0) > (a.lastReview || 0)) ? b : a
}

function mergeProfiles(local, remote) {
  if (!remote) return local
  const exp = Math.max((local && local.exp) || 0, remote.exp || 0)
  const coin = Math.max((local && local.coin) || 0, remote.coin || 0)
  const streak = Math.max((local && local.streak) || 0, remote.streak || 0)
  const lastCheckin = Math.max((local && local.lastCheckin) || 0, remote.lastCheckin || 0)
  const badges = {}
  ;((local && local.badges) || []).concat(remote.badges || []).forEach(b => { badges[b] = 1 })
  return {
    exp, coin, streak, lastCheckin,
    badges: Object.keys(badges),
    level: Math.max(Math.floor(exp / 200) + 1, (remote.level || 1), ((local && local.level) || 1)),
    createdAt: Math.min((local && local.createdAt) || Date.now(), remote.createdAt || Date.now())
  }
}

function mergeProgress(local, remote) {
  if (!remote) return local
  local = local || {}
  const out = {}
  const bookIds = new Set(Object.keys(local).concat(Object.keys(remote)))
  bookIds.forEach(bid => {
    const L = local[bid] || { levels: {}, learned: 0 }
    const R = remote[bid] || { levels: {}, learned: 0 }
    const levels = {}
    const lvIds = new Set(Object.keys(L.levels || {}).concat(Object.keys(R.levels || {})))
    lvIds.forEach(k => {
      const lv = L.levels[k] || {}
      const rv = R.levels[k] || {}
      levels[k] = {
        stars: Math.max(lv.stars || 0, rv.stars || 0),
        bestAccuracy: Math.max(lv.bestAccuracy || 0, rv.bestAccuracy || 0),
        passed: !!(lv.passed || rv.passed)
      }
    })
    out[bid] = { levels, learned: Math.max(L.learned || 0, R.learned || 0) }
  })
  return out
}

function mergeSrs(local, remote) {
  if (!remote) return local
  local = local || {}
  const out = Object.assign({}, local)
  Object.keys(remote).forEach(k => {
    if (!out[k]) out[k] = remote[k]
    else out[k] = maxRec(out[k], remote[k])
  })
  return out
}

function mergeLearned(local, remote) {
  if (!remote) return local
  local = local || {}
  const out = Object.assign({}, local)
  Object.keys(remote).forEach(bid => {
    const base = out[bid] || []
    const set = new Set(base.concat(remote[bid] || []))
    out[bid] = Array.from(set)
  })
  return out
}

// 生词本词条合并：按拼写去重，双端都有的取 addedAt 较新的一份，新收藏放前
function mergeMybox(local, remote) {
  const map = {}
  ;(local || []).forEach(w => { if (w && w.spell) map[String(w.spell).toLowerCase()] = w })
  ;(remote || []).forEach(w => {
    if (!w || !w.spell) return
    const key = String(w.spell).toLowerCase()
    const lw = map[key]
    if (!lw) { map[key] = w; return }
    const lt = lw.addedAt || 0
    const rt = w.addedAt || 0
    if (rt > lt || (!lt && rt)) map[key] = w
  })
  return Object.keys(map).map(k => map[k]).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
}

/* ---------- 恢复 / 同步入口 ---------- */
async function applyRemote(remoteMeta, remoteSrs, remoteLearned) {
  const localClean = !hasLocalData()
  // profile/progress：本地干净则整体恢复；否则合并
  if (remoteMeta && remoteMeta.profile) {
    const profile = localClean ? remoteMeta.profile : mergeProfiles(localMeta().profile, remoteMeta.profile)
    wx.setStorageSync(USER_KEY, profile)
  }
  if (remoteMeta && remoteMeta.progress) {
    const progress = localClean ? remoteMeta.progress : mergeProgress(localMeta().progress, remoteMeta.progress)
    wx.setStorageSync(PROG_KEY, progress)
  }
  if (remoteMeta && remoteMeta.hand) wx.setStorageSync(HAND_KEY, remoteMeta.hand)
  // mybox 生词本词条：合并后刷回内存词库
  if (remoteMeta && remoteMeta.mybox && remoteMeta.mybox.length) {
    const mybox = mergeMybox(wx.getStorageSync('mybox_words') || [], remoteMeta.mybox)
    wx.setStorageSync('mybox_words', mybox)
    try { require('./wordbank.js').reloadMybox() } catch (e) {}
  }
  // srs：按词合并（取 lastReview 较新）
  if (remoteSrs && Object.keys(remoteSrs).length) {
    const srs = mergeSrs(localSrs(), remoteSrs)
    wx.setStorageSync(SRS_KEY, srs)
  }
  // learned 词表：并集
  const learned = mergeLearned(learnedBooks(), remoteLearned)
  Object.keys(learned).forEach(bid => wx.setStorageSync('learned_words_' + bid, learned[bid]))
}

async function pullOnce() {
  const res = await callFn({ action: 'pull' }).catch(e => { console.warn('[sync] pull 失败', e); return null })
  if (!res || !res.ok || res.error) return null
  return res
}

// 启动同步：本地全新 → 整包恢复；本地已有 → 云端比本地新则按字段合并（双设备不丢）
async function init() {
  if (!enabled) return
  const oid = await fetchOpenid()
  if (!oid) return
  const res = await pullOnce()
  if (!res) return
  const remoteMeta = res.meta
  const remoteSrs = res.srs || {}
  const remoteLearned = res.learned || {}
  if (!remoteMeta && !Object.keys(remoteSrs).length && !Object.keys(remoteLearned).length) return // 云端无存档
  const lastSavedAt = Number(wx.getStorageSync(TAG_KEY) || 0)
  const remoteAt = (remoteMeta && remoteMeta.updatedAt) || 0
  if (!hasLocalData()) {
    // 新设备/清缓存：整包恢复
    await applyRemote(remoteMeta, remoteSrs, remoteLearned)
    wx.setStorageSync(TAG_KEY, Date.now())
    if (hasLocalData()) flush() // 回传一次，确保双端一致
    return
  }
  // 已有本地数据：云端比上次上传新 → 增量合并（取各字段较优值）
  if (remoteAt > lastSavedAt) {
    await applyRemote(remoteMeta, remoteSrs, remoteLearned)
    wx.setStorageSync(TAG_KEY, Date.now())
    flush()
  }
}

// 从云端拉取并合并到本地；force=true 时忽略本地全新判断（供「我的」页手动恢复）
async function restore(force) {
  if (!enabled) return
  const oid = await fetchOpenid()
  if (!oid) return
  if (!force && hasLocalData()) return // 本地有记录时走 merge，不主动全量覆盖
  const res = await pullOnce()
  if (!res) return
  const remoteMeta = res.meta
  const remoteSrs = res.srs || {}
  const remoteLearned = res.learned || {}
  if (!remoteMeta && !Object.keys(remoteSrs).length && !Object.keys(remoteLearned).length) return // 云端无存档
  const lastSavedAt = Number(wx.getStorageSync(TAG_KEY) || 0)
  if (!force && remoteMeta && remoteMeta.updatedAt && remoteMeta.updatedAt <= lastSavedAt) return
  await applyRemote(remoteMeta, remoteSrs, remoteLearned)
  wx.setStorageSync(TAG_KEY, Date.now())
  if (hasLocalData()) flush()
}

function disable() { enabled = false }
function isEnabled() { return enabled }
// 供「我的」页手动同步使用
function syncNow() {
  if (!cloudReady()) return Promise.resolve(false)
  return flush().then(() => true).catch(() => false)
}
function restoreNow() {
  if (!cloudReady()) return Promise.resolve(false)
  return restore(true).then(() => true).catch(() => false)
}

module.exports = {
  init, notify, flush, restore, restoreNow, syncNow,
  hasLocalData, isEnabled, disable,
  // 供 store.js 读取「继续学习」断点（统一存放，避免多处 key 分散）
  saveLastPos, loadLastPos, clearLastPos
}

// ---------- 断点续学（最近学习位置） ----------
function saveLastPos(pos) {
  try {
    if (!pos) wx.removeStorageSync(LASTPOS_KEY)
    else wx.setStorageSync(LASTPOS_KEY, Object.assign({ at: Date.now() }, pos))
  } catch (e) {}
}
function loadLastPos() {
  try { return wx.getStorageSync(LASTPOS_KEY) || null } catch (e) { return null }
}
function clearLastPos() {
  try { wx.removeStorageSync(LASTPOS_KEY) } catch (e) {}
}
