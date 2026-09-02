// utils/dict.js —— 在线查词/翻译（走 dict 云函数，不受域名白名单限制）
// 带本地缓存：30 天内重复查过的词直接返回，省流量也保证离线可见上次结果

const CACHE_KEY = 'dict_cache_v1'
const CACHE_TTL = 30 * 24 * 3600 * 1000
const CACHE_MAX = 150

function loadCache() {
  try { return wx.getStorageSync(CACHE_KEY) || {} } catch (e) { return {} }
}

function saveCache(c) {
  try { wx.setStorageSync(CACHE_KEY, c) } catch (e) {}
}

// 在线查询；cloud 不可用或调用失败返回 null（调用方自行降级提示）
function lookupOnline(text) {
  const q = String(text || '').trim()
  if (!q) return Promise.resolve(null)
  const key = q.toLowerCase()
  const cache = loadCache()
  const hit = cache[key]
  if (hit && Date.now() - hit.t < CACHE_TTL) return Promise.resolve(hit.data)

  if (!wx.cloud || !wx.cloud.callFunction) return Promise.resolve(null)
  return wx.cloud.callFunction({ name: 'dict', data: { text: q } }).then(res => {
    const r = res && res.result
    if (!r || !r.ok) return null
    // 简单 LRU：满了丢最旧的
    const keys = Object.keys(cache)
    if (keys.length >= CACHE_MAX) {
      const old = keys.slice().sort((a, b) => (cache[a].t || 0) - (cache[b].t || 0))
      const rm = old.slice(0, Math.max(5, keys.length - CACHE_MAX + 5))
      rm.forEach(k => { delete cache[k] })
    }
    cache[key] = { t: Date.now(), data: r }
    saveCache(cache)
    return r
  }).catch(() => null)
}

module.exports = { lookupOnline }
