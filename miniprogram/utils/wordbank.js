// utils/wordbank.js —— 统一词库访问层
// 内置词库（data/words.js，离线保底）+ 云端词库（云数据库 books/words 集合，按需下载缓存）
// 对外 API 与 data/words.js 完全兼容：getBooks/getWords/getWord/getLevelWords/getLevelCount
// 额外提供：loadCloudBooks / download / remove / ensureBook / isCloud / isDownloaded / isBuiltin
const builtin = require('../data/words.js')

const META_KEY = 'wordbank_cloud_meta'        // 云端词库元数据缓存（storage）
const DOWNLOADED_KEY = 'wordbank_downloaded'  // 已下载记录 { bookId: version }
const DIR = `${wx.env.USER_DATA_PATH}/wordbank`

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
  CLOUD.filter(c => ids.indexOf(c.bookId) < 0).forEach(c => {
    const have = !!POOL[c.bookId]
    list.push(Object.assign({}, c, {
      source: 'cloud', downloaded: have,
      wordCount: have ? POOL[c.bookId].length : (c.wordCount || 0)
    }))
  })
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
function download(bookId) {
  ensureInit()
  if (POOL[bookId]) return Promise.resolve(POOL[bookId])
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
    const downloaded = wx.getStorageSync(DOWNLOADED_KEY) || {}
    const meta = CLOUD.find(c => c.bookId === bookId)
    downloaded[bookId] = (meta && meta.version) || 1
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
  isBuiltin, isCloud, isDownloaded,
  loadCloudBooks, download, remove, ensureBook
}
