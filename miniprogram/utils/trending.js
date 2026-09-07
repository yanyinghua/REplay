// utils/trending.js —— 「今日双语热点」内容访问层 + 兴趣标签
// 数据优先级：本地当日缓存 → 云端当日内容流(daily-trending 云函数懒生成) → 内置离线短句兜底
// 兴趣标签保存在 user_profile.interest_tags（随云存档整体同步）
const store = require('./store.js')
const offline = require('../data/trending.js').OFFLINE_ITEMS || []

// 兴趣标签定义（与云端 daily-trending 的内容分类一一对应）
const INTERESTS = [
  { id: 'tech', name: '科技', icon: '💻' },
  { id: 'business', name: '商业', icon: '💼' },
  { id: 'science', name: '科学自然', icon: '🔬' },
  { id: 'health', name: '健康', icon: '💚' },
  { id: 'sport', name: '体育', icon: '⚽' },
  { id: 'entertainment', name: '影视娱乐', icon: '🎬' }
]
const NAME_MAP = {}
INTERESTS.forEach(i => { NAME_MAP[i.id] = i })

const CACHE_KEY = 'trending_cache_v1'
const FAIL_KEY = 'trending_fail_date'

// 统一取「今天」的日期键（UTC+8，与云函数一致）
function dateKey(d) {
  d = d || new Date()
  const off = new Date(d.getTime() + 8 * 3600 * 1000)
  return off.toISOString().slice(0, 10)
}

const RETRY_MS = 30 * 60 * 1000 // 云端生成失败后 30 分钟内不重复请求；超过则自动再试（配合云函数重试）

function loadCache() {
  try { return wx.getStorageSync(CACHE_KEY) || null } catch (e) { return null }
}
function saveCache(date, items) {
  try { wx.setStorageSync(CACHE_KEY, { date, items }) } catch (e) {}
}
// 云端失败记录 {date, ts}
function loadFail() {
  try { return wx.getStorageSync(FAIL_KEY) || null } catch (e) { return null }
}
function failBlocked(today) {
  const f = loadFail()
  return !!(f && f.date === today && f.ts && Date.now() - f.ts < RETRY_MS)
}
function markFail(date) {
  try { wx.setStorageSync(FAIL_KEY, { date, ts: Date.now() }) } catch (e) {}
}

// 以日期为种子的伪随机打乱：即使纯离线兜底，每天内容顺序也不同，减少「永远是那几条」的观感
function seededRand(seed) {
  let t = (seed >>> 0) || 1
  return () => {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
function shuffleByDate(list, date) {
  const a = list.slice()
  let seed = 7
  date.split('-').forEach(p => { seed = seed * 31 + (Number(p) || 0) })
  const rand = seededRand(seed)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

function catName(cat) {
  const i = NAME_MAP[cat]
  return i ? i.name : '推荐'
}

// 给条目补上分类显示名；只保留 en+zh 都需要的字段
function decorate(list) {
  return (list || []).filter(x => x && x.en).map((x, i) => ({
    key: 'k' + i,
    cat: x.cat || '',
    catName: catName(x.cat),
    en: String(x.en).trim(),
    zh: String(x.zh || '').trim()
  }))
}

// 按兴趣排序：命中的分类排前面，且保持用户选择顺序；其余补在后面
function filterByInterest(list, interests) {
  if (!list.length) return list
  if (!interests || !interests.length) return list.slice(0, 12)
  const hit = []
  const rest = []
  interests.forEach(id => {
    list.forEach((x, i) => {
      if (x.cat === id && !x._used) { x._used = true; hit.push(x) }
    })
  })
  list.forEach(x => { if (!x._used) rest.push(x) })
  const out = hit.concat(rest)
  out.forEach(x => { delete x._used })
  return out.slice(0, 12)
}

// 核心：加载当日热点流（含缓存与离线兜底）
function loadFeed() {
  const interests = store.getInterestTags()
  const today = dateKey()
  const cached = loadCache()
  const offlineItems = () => shuffleByDate(decorate(offline), today) // 离线兜底：按当日日期换序
  // 1) 当日已成功拿到内容 → 直接用
  if (cached && cached.date === today && cached.items && cached.items.length) {
    return Promise.resolve({ date: today, source: cached.source || 'cache', items: filterByInterest(cached.items, interests) })
  }
  // 2) 云端刚失败过（30 分钟内）→ 不再反复请求，先用离线兜底
  if (failBlocked(today)) {
    return Promise.resolve({ date: today, source: 'offline', items: filterByInterest(offlineItems(), interests) })
  }
  // 3) 请求云端（不存在当日内容时云函数会懒生成并入库；失败超 30 分钟会自动再试）
  return fetchCloud().then(res => {
    if (res && res.items && res.items.length) {
      const items = decorate(res.items)
      saveCache(today, items)
      return { date: today, source: 'cloud', items: filterByInterest(items, interests) }
    }
    markFail(today)
    return { date: today, source: 'offline', items: filterByInterest(offlineItems(), interests) }
  }).catch(() => {
    markFail(today)
    return { date: today, source: 'offline', items: filterByInterest(offlineItems(), interests) }
  })
}

function fetchCloud(data) {
  if (!wx.cloud || !wx.cloud.callFunction) return Promise.resolve(null)
  return wx.cloud.callFunction({ name: 'daily-trending', data: data || {} })
    .then(r => (r && r.result && r.result.ok) ? r.result : null)
    .catch(() => null)
}

// 手动强制刷新今日热点：忽略当天缓存，让云端重新抓取+翻译并覆盖
// 成功 → 更新本地缓存并返回新列表；失败/无新内容 → 返回 null（旧缓存不动）
function manualRefresh() {
  const today = dateKey()
  const interests = store.getInterestTags()
  return fetchCloud({ force: true }).then(res => {
    if (res && res.items && res.items.length) {
      const items = decorate(res.items)
      saveCache(today, items)
      try { wx.removeStorageSync(FAIL_KEY) } catch (e) {}
      return { date: today, source: res.cached ? 'cache' : 'cloud', refreshed: !!res.refreshed, items: filterByInterest(items, interests) }
    }
    markFail(today)
    return null
  }).catch(() => {
    markFail(today)
    return null
  })
}

// 兴趣读写（profile 字段，云存档自动同步）
function getInterestTags() { return store.getInterestTags() }
function setInterestTags(ids) { return store.setInterestTags(ids) }
function interestText() {
  const tags = getInterestTags()
  if (!tags.length) return ''
  return tags.map(id => (NAME_MAP[id] ? NAME_MAP[id].name : id)).slice(0, 3).join(' / ')
}

module.exports = {
  INTERESTS, NAME_MAP, dateKey,
  loadFeed, manualRefresh, getInterestTags, setInterestTags, interestText
}
