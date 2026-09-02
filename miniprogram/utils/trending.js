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

function loadCache() {
  try { return wx.getStorageSync(CACHE_KEY) || null } catch (e) { return null }
}
function saveCache(date, items) {
  try { wx.setStorageSync(CACHE_KEY, { date, items }) } catch (e) {}
}
function failDate() {
  try { return wx.getStorageSync(FAIL_KEY) || '' } catch (e) { return '' }
}
function markFail(date) {
  try { wx.setStorageSync(FAIL_KEY, date) } catch (e) {}
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
  // 1) 当日已成功拿到内容 → 直接用
  if (cached && cached.date === today && cached.items && cached.items.length) {
    return Promise.resolve({ date: today, source: cached.source || 'cache', items: filterByInterest(cached.items, interests) })
  }
  // 2) 当日云端已失败过 → 不再反复请求，直接用离线
  if (failDate() === today) {
    return Promise.resolve({ date: today, source: 'offline', items: filterByInterest(decorate(offline), interests) })
  }
  // 3) 请求云端（不存在当日内容时云函数会懒生成并入库）
  return fetchCloud().then(res => {
    if (res && res.items && res.items.length) {
      const items = decorate(res.items)
      saveCache(today, items)
      return { date: today, source: 'cloud', items: filterByInterest(items, interests) }
    }
    markFail(today)
    return { date: today, source: 'offline', items: filterByInterest(decorate(offline), interests) }
  }).catch(() => {
    markFail(today)
    return { date: today, source: 'offline', items: filterByInterest(decorate(offline), interests) }
  })
}

function fetchCloud() {
  if (!wx.cloud || !wx.cloud.callFunction) return Promise.resolve(null)
  return wx.cloud.callFunction({ name: 'daily-trending' })
    .then(r => (r && r.result && r.result.ok) ? r.result : null)
    .catch(() => null)
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
  loadFeed, getInterestTags, setInterestTags, interestText
}
