// utils/wordbank.js —— 统一词库访问层
// 内置词库（data/words.js，离线保底）+ 云端词库（云数据库 books/words 集合，按需下载缓存）
// 对外 API 与 data/words.js 完全兼容：getBooks/getWords/getWord/getLevelWords/getLevelCount
// 额外提供：loadCloudBooks / download / remove / ensureBook / isCloud / isDownloaded / isBuiltin
const builtin = require('../data/words.js')
const sync = require('./sync.js')

const META_KEY = 'wordbank_cloud_meta'        // 云端词库元数据缓存（storage）
const DOWNLOADED_KEY = 'wordbank_downloaded'  // 已下载记录 { bookId: version }
const DIR = `${wx.env.USER_DATA_PATH}/wordbank`

/* ---------- 我的生词本（虚拟词库：搜索页在线查词一键收藏，进入正常学习流程） ---------- */
const MYBOX_ID = 'mybox'
const MYBOX_KEY = 'mybox_words'
const MYBOX_META = {
  bookId: MYBOX_ID, name: '我的生词本', desc: '在线查词收藏的生词，随你选择学习',
  emoji: '⭐', color: '#f5a623', source: 'mine', downloaded: true
}

let fs = null
try { fs = wx.getFileSystemManager() } catch (e) {}

const LEVEL_SIZE = 10
const POOL = {}   // bookId -> words[]（内存池：内置 + 已下载云端）
let CLOUD = []    // 云端词库元数据
let BOOKS = []    // 合并后的展示元数据
let READY = false

function builtinIds() { return builtin.getBooks().map(b => b.bookId) }

function ensureInit() {
  if (READY) return
  builtin.getBooks().forEach(b => { POOL[b.bookId] = builtin.getWords(b.bookId) })
  // 恢复已下载的云端词库（从本地文件读入内存）
  let downloaded = {}
  try { downloaded = wx.getStorageSync(DOWNLOADED_KEY) || {} } catch (e) {}
  Object.keys(downloaded).forEach(bookId => {
    try {
      const p = `${DIR}/${bookId}.json`
      if (fs.accessSync(p) === undefined) {
        POOL[bookId] = JSON.parse(fs.readFileSync(p, 'utf8'))
      }
    } catch (e) {}
  })
  try { POOL[MYBOX_ID] = rawMybox() } catch (e) { POOL[MYBOX_ID] = [] }
  try { CLOUD = wx.getStorageSync(META_KEY) || [] } catch (e) {}
  rebuildBooks()
  READY = true
}

function rebuildBooks() {
  const ids = builtinIds()
  const list = []
  builtin.getBooks().forEach(b => {
    list.push(Object.assign({}, b, { source: 'builtin', downloaded: true, wordCount: POOL[b.bookId].length }))
  })
  CLOUD.filter(c => ids.indexOf(c.bookId) < 0 && c.bookId !== MYBOX_ID).forEach(c => {
    const have = !!POOL[c.bookId]
    list.push(Object.assign({}, c, {
      source: 'cloud', downloaded: have,
      wordCount: have ? POOL[c.bookId].length : (c.wordCount || 0)
    }))
  })
  // 「我的生词本」置顶（仅在收藏了单词时出现）
  const mybox = (POOL[MYBOX_ID] || [])
  if (mybox.length) {
    list.unshift(Object.assign({}, MYBOX_META, { wordCount: mybox.length }))
  }
  BOOKS = list
}

// ---------- 同步 API（与 data/words.js 兼容） ----------
function getBooks() { ensureInit(); return BOOKS }
function getWords(bookId) { ensureInit(); return POOL[bookId] || [] }
function getWord(id) {
  ensureInit()
  for (const k in POOL) {
    const w = POOL[k].find(x => x.id === id)
    if (w) return w
  }
  return null
}
function getLevelWords(bookId, levelIdx) {
  const list = getWords(bookId)
  const start = (levelIdx || 0) * LEVEL_SIZE
  return list.slice(start, start + LEVEL_SIZE)
}

// 按拼写查词（阅读点词查义用；遍历已加载词库，大小写不敏感）
function searchBySpell(spell) {
  ensureInit()
  const s = (spell || '').trim().toLowerCase()
  if (!s) return null
  for (const k in POOL) {
    const w = POOL[k].find(x => (x.spell || '').toLowerCase() === s)
    if (w) return w
  }
  return null
}
function getLevelCount(bookId) { return Math.ceil(getWords(bookId).length / LEVEL_SIZE) }

function isBuiltin(bookId) { return builtinIds().indexOf(bookId) >= 0 }
function isCloud(bookId) { ensureInit(); return CLOUD.some(c => c.bookId === bookId) }
function isDownloaded(bookId) { ensureInit(); return !!POOL[bookId] }

// ---------- 云端：拉取 books 集合元数据 ----------
function loadCloudBooks() {
  ensureInit()
  return new Promise(resolve => {
    if (!wx.cloud || !wx.cloud.database) { rebuildBooks(); return resolve(CLOUD) }
    const db = wx.cloud.database()
    db.collection('books').count().then(r => {
      const total = r.total || 0
      if (!total) { rebuildBooks(); return resolve(CLOUD) }
      const pages = Math.ceil(total / 20)
      const tasks = []
      for (let i = 0; i < pages; i++) {
        tasks.push(db.collection('books').skip(i * 20).limit(20).get())
      }
      return Promise.all(tasks)
    }).then(ress => {
      CLOUD = []
      ;(ress || []).forEach(r => CLOUD.push.apply(CLOUD, r.data || []))
      wx.setStorageSync(META_KEY, CLOUD)
      rebuildBooks()
      resolve(CLOUD)
    }).catch(err => {
      console.warn('加载云端词库列表失败', err)
      rebuildBooks()
      resolve(CLOUD)
    })
  })
}

// ---------- 云端：分页拉取词条 ----------
// 方式一（首选）：get-words 云函数，每页 1000 条、并发 5，20000 词约 3 秒
// 方式二（回退）：直连数据库分页，每页 100 条、并发 4（云函数未部署时使用）
function stripDoc(w) {
  const o = Object.assign({}, w)
  delete o._id
  return o
}

function fetchViaFunction(bookId) {
  const PAGE = 1000
  const CONC = 5
  return wx.cloud.callFunction({ name: 'get-words', data: { bookId, skip: 0, limit: PAGE } })
    .then(r => {
      const d = r.result || {}
      if (!d.ok || d.error) throw new Error(d.error || 'get-words 返回异常')
      const first = (d.list || []).map(stripDoc)
      const total = d.total || first.length
      if (!total) throw new Error('词库为空或尚未发布')
      const pages = Math.ceil(total / PAGE)
      const out = first.slice()
      if (pages <= 1) return out
      let idx = 1
      async function worker() {
        while (idx < pages) {
          const i = idx++
          const rr = await wx.cloud.callFunction({ name: 'get-words', data: { bookId, skip: i * PAGE, limit: PAGE } })
          const dd = rr.result || {}
          if (!dd.ok || dd.error) throw new Error(dd.error || 'get-words 返回异常')
          ;(dd.list || []).forEach(w => out.push(stripDoc(w)))
        }
      }
      const workers = []
      for (let i = 0; i < Math.min(CONC, pages - 1); i++) workers.push(worker())
      return Promise.all(workers).then(() => out)
    })
}

function fetchAll(col, bookId, total) {
  const PAGE = 100
  const pages = Math.ceil(total / PAGE)
  const out = []
  const CONC = 4
  let idx = 0
  async function worker() {
    while (idx < pages) {
      const i = idx++
      const r = await col.where({ bookId }).skip(i * PAGE).limit(PAGE).get()
      ;(r.data || []).forEach(w => out.push(stripDoc(w)))
    }
  }
  const workers = []
  for (let i = 0; i < Math.min(CONC, pages); i++) workers.push(worker())
  return Promise.all(workers).then(() => out)
}

function saveToFile(bookId, words) {
  try {
    try { fs.accessSync(DIR) } catch (e) { fs.mkdirSync(DIR, true) }
    fs.writeFileSync(`${DIR}/${bookId}.json`, JSON.stringify(words), 'utf8')
  } catch (e) { console.warn('写入词库缓存失败', e) }
}

// 下载云端词库到本地（文件缓存 + 内存池）
// 优先走 get-words 云函数（1000 条/次），云函数未部署时回退直连数据库分页
// 版本校验：云端 books.version 高于本地缓存版本时自动重新拉取（如词库数据更新后）
function download(bookId) {
  ensureInit()
  const downloaded = wx.getStorageSync(DOWNLOADED_KEY) || {}
  const local = downloaded[bookId] || 0
  const meta = CLOUD.find(c => c.bookId === bookId)
  const remote = (meta && meta.version) || 1
  // 已下载且版本一致 → 直接用本地缓存
  if (POOL[bookId] && remote <= local) return Promise.resolve(POOL[bookId])
  if (!wx.cloud || !wx.cloud.database) return Promise.reject(new Error('云开发不可用'))
  const db = wx.cloud.database()

  let fetchP
  if (wx.cloud.callFunction) {
    fetchP = fetchViaFunction(bookId).catch(err => {
      console.warn('get-words 云函数拉取失败，回退直连数据库', err)
      return db.collection('words').where({ bookId }).count().then(r => {
        const total = r.total || 0
        if (!total) return Promise.reject(new Error('词库为空或尚未发布'))
        return fetchAll(db.collection('words'), bookId, total)
      })
    })
  } else {
    fetchP = db.collection('words').where({ bookId }).count().then(r => {
      const total = r.total || 0
      if (!total) return Promise.reject(new Error('词库为空或尚未发布'))
      return fetchAll(db.collection('words'), bookId, total)
    })
  }

  return fetchP.then(words => {
    if (!words.length) throw new Error('词库为空')
    saveToFile(bookId, words)
    POOL[bookId] = words
    downloaded[bookId] = remote
    wx.setStorageSync(DOWNLOADED_KEY, downloaded)
    rebuildBooks()
    return words
  })
}

// 删除本地下载的云端词库
function remove(bookId) {
  ensureInit()
  if (isBuiltin(bookId)) return
  const downloaded = wx.getStorageSync(DOWNLOADED_KEY) || {}
  delete downloaded[bookId]
  wx.setStorageSync(DOWNLOADED_KEY, downloaded)
  delete POOL[bookId]
  try { fs.unlinkSync(`${DIR}/${bookId}.json`) } catch (e) {}
  rebuildBooks()
}

/* ---------- 我的生词本（虚拟词库 mybox） ---------- */
function rawMybox() {
  try { return wx.getStorageSync(MYBOX_KEY) || [] } catch (e) { return [] }
}

function isMybox(bookId) { return bookId === MYBOX_ID }

function getMyboxWords() {
  ensureInit()
  return POOL[MYBOX_ID] || []
}

function hasMyboxWord(spell) {
  const s = String(spell || '').trim().toLowerCase()
  if (!s) return false
  return getMyboxWords().some(w => String(w.spell || '').toLowerCase() === s)
}

// storage/内存/书本列表三者同步刷新
function saveMyboxWords(list) {
  try { wx.setStorageSync(MYBOX_KEY, list) } catch (e) {}
  POOL[MYBOX_ID] = list
  rebuildBooks()
}

// 云同步恢复后调用：把 storage 最新内容刷回内存并重建书本列表
function reloadMybox() {
  saveMyboxWords(rawMybox())
}

// 从在线词典收藏一个词（词对象字段与内置词条兼容：spell/meaning/phonetic/example/exampleZh）
function addMyboxWord(w) {
  ensureInit()
  const spell = String((w && w.spell) || '').trim()
  if (!spell) return { ok: false, reason: 'empty' }
  const lower = spell.toLowerCase()
  const list = rawMybox()
  if (list.some(x => String(x.spell || '').toLowerCase() === lower)) return { ok: false, exists: true }
  const item = Object.assign({
    id: lower, bookId: MYBOX_ID, emoji: '⭐', tags: [],
    phonetic: '', meaning: '', example: '', exampleZh: '',
    source: 'dict', addedAt: Date.now()
  }, w || {}, { id: lower, bookId: MYBOX_ID })
  list.unshift(item) // 最新收藏放最前
  saveMyboxWords(list)
  sync.notify() // 生词本内容变更 → 上云
  return { ok: true, item }
}

function removeMyboxWord(spell) {
  ensureInit()
  const lower = String(spell || '').trim().toLowerCase()
  if (!lower) return { ok: false }
  const list = rawMybox()
  const next = list.filter(x => String(x.spell || '').toLowerCase() !== lower)
  if (next.length === list.length) return { ok: false }
  saveMyboxWords(next)
  sync.notify() // 生词本内容变更 → 上云
  return { ok: true }
}

// ---------- 自定义选词集（词库中心/词库页勾选想学的词后学习） ----------
function setPickIds(bookId, ids) {
  try { wx.setStorageSync('pick_words_' + bookId, ids || []) } catch (e) {}
}
function getPickIds(bookId) {
  try { return wx.getStorageSync('pick_words_' + bookId) || [] } catch (e) { return [] }
}

// ---------- 已学单词（学习过默认锁定不可再选，双击解锁后可重新选择） ----------
function getLearnedIds(bookId) {
  try { return wx.getStorageSync('learned_words_' + bookId) || [] } catch (e) { return [] }
}
function saveLearnedIds(bookId, ids) {
  try { wx.setStorageSync('learned_words_' + bookId, ids || []) } catch (e) {}
}
function addLearned(bookId, id) {
  const set = new Set(getLearnedIds(bookId))
  set.add(id)
  saveLearnedIds(bookId, Array.from(set))
  sync.notify() // 已学词表变更 → 上云
}
function addLearnedBatch(bookId, ids) {
  if (!ids || !ids.length) return
  const set = new Set(getLearnedIds(bookId))
  ids.forEach(id => set.add(id))
  saveLearnedIds(bookId, Array.from(set))
  sync.notify() // 已学词表变更 → 上云
}
function removeLearnedBatch(bookId, ids) {
  if (!ids || !ids.length) return
  const set = new Set(getLearnedIds(bookId))
  ids.forEach(id => set.delete(id))
  saveLearnedIds(bookId, Array.from(set))
  sync.notify() // 已学词表变更 → 上云
}
function removeLearned(bookId, id) {
  const set = new Set(getLearnedIds(bookId))
  set.delete(id)
  saveLearnedIds(bookId, Array.from(set))
  sync.notify() // 已学词表变更 → 上云
}

// 确保词库就绪（内置：同步就绪；云端：先查内存/文件，未下载则拉取）
function ensureBook(bookId) {
  ensureInit()
  if (POOL[bookId]) return Promise.resolve(POOL[bookId])
  if (isBuiltin(bookId)) return Promise.resolve(POOL[bookId] || [])
  if (!isCloud(bookId)) return Promise.reject(new Error('词库不存在'))
  return download(bookId)
}

module.exports = {
  LEVEL_SIZE,
  getBooks, getWords, getWord, getLevelWords, getLevelCount,
  searchBySpell,
  isBuiltin, isCloud, isDownloaded,
  loadCloudBooks, download, remove, ensureBook,
  setPickIds, getPickIds,
  getLearnedIds, addLearned, addLearnedBatch, removeLearned, removeLearnedBatch,
  isMybox, getMyboxWords, hasMyboxWord, addMyboxWord, removeMyboxWord, reloadMybox
}
