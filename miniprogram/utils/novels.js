// utils/novels.js —— 双语阅读内容访问层（与 utils/wordbank.js 同构）
// 数据源：
//   1) 内置样书 data/novels.js（离线保底）
//   2) 云端「名著仓库」：novels 集合（书目元数据）+ novel_chapters 集合（章节双语正文）
// 下载/更新：整本章节拉取后缓存到用户文件目录；以 version 比对实现「自动更新」。
const sample = require('../data/novels.js')
const sampleBooks = sample.SAMPLE_NOVELS || []

const META_KEY = 'novel_cloud_meta'        // 云端书目缓存
const DOWNLOADED_KEY = 'novel_downloaded'  // 已下载记录 { novelId: { version } }
const AUTO_KEY = 'novel_auto_update'       // 自动更新开关（默认开）
const DIR = `${wx.env.USER_DATA_PATH}/novels`

let fs = null
try { fs = wx.getFileSystemManager() } catch (e) {}

let CLOUD = []    // 云端书目元数据
let READY = false

function ensureInit() {
  if (READY) return
  try { CLOUD = wx.getStorageSync(META_KEY) || [] } catch (e) {}
  READY = true
}

function getSampleBy(novelId) {
  const b = sampleBooks.find(s => s.meta.novelId === novelId)
  return b || null
}

function downloadedRec() {
  try { return wx.getStorageSync(DOWNLOADED_KEY) || {} } catch (e) { return {} }
}
function localVersion(novelId) {
  const rec = downloadedRec()[novelId]
  return rec && rec.version ? rec.version : 0
}

function readLocalFile(novelId) {
  try {
    const p = `${DIR}/${novelId}.json`
    if (fs.accessSync(p) === undefined) {
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    }
  } catch (e) {}
  return null
}

// ---------- 书目列表（内置 + 云端，含下载/更新状态） ----------
// 规则：内置样书始终展示为可读；若云端存在同名且版本更高 → 切换为云端条目并提供下载/更新。
function getBooks() {
  ensureInit()
  const rows = []
  sampleBooks.forEach(s => {
    const m = s.meta
    const c = CLOUD.find(x => x.novelId === m.novelId)
    const cloudV = (c && c.version) || 0
    const sampleV = m.version || 1
    const dlv = localVersion(m.novelId)
    if (c && cloudV > sampleV) {
      // 云端推出更高版：接管本书，未下载则提示「下载新版」
      rows.push({
        novelId: m.novelId, title: c.title || m.title, enTitle: c.enTitle || m.enTitle || '',
        author: c.author || m.author || '', desc: c.desc || m.desc || '',
        emoji: c.emoji || m.emoji || '📕', color: c.color || m.color || '#4f6ef7',
        wordCount: c.wordCount || 0, chapterCount: c.chapterCount || 0,
        source: 'cloud', version: cloudV, updatedAt: c.updatedAt || 0,
        sampleBase: true, downloaded: dlv >= cloudV,
        needUpdate: dlv > 0 && cloudV > dlv,
        canDelete: dlv > 0, readable: dlv >= cloudV
      })
    } else {
      rows.push({
        novelId: m.novelId, title: m.title, enTitle: m.enTitle || '',
        author: m.author || '', desc: m.desc || '', emoji: m.emoji || '📕',
        color: m.color || '#4f6ef7',
        wordCount: m.wordCount || 0, chapterCount: m.chapterCount || 0,
        source: 'sample', version: sampleV, sampleBase: true,
        downloaded: false, needUpdate: false, canDelete: false, readable: true
      })
    }
  })
  // 云端独有书目（无内置版本）
  CLOUD.forEach(c => {
    if (sampleBooks.some(s => s.meta.novelId === c.novelId)) return
    const dlv = localVersion(c.novelId)
    const ver = c.version || 1
    rows.push({
      novelId: c.novelId, title: c.title || c.name, enTitle: c.enTitle || '',
      author: c.author || '', desc: c.desc || '', emoji: c.emoji || '📕',
      color: c.color || '#4f6ef7',
      wordCount: c.wordCount || 0, chapterCount: c.chapterCount || 0,
      source: 'cloud', version: ver, updatedAt: c.updatedAt || 0,
      sampleBase: false, downloaded: dlv >= ver,
      needUpdate: dlv > 0 && ver > dlv,
      canDelete: dlv > 0, readable: dlv >= ver
    })
  })
  return rows
}

// ---------- 云端书目元数据 ----------
function loadCloudNovels() {
  ensureInit()
  return new Promise(resolve => {
    if (!wx.cloud || !wx.cloud.database) return resolve(CLOUD)
    const db = wx.cloud.database()
    db.collection('novels').count().then(r => {
      const total = r.total || 0
      if (!total) return resolve(CLOUD)
      const pages = Math.ceil(total / 20)
      const tasks = []
      for (let i = 0; i < pages; i++) {
        tasks.push(db.collection('novels').skip(i * 20).limit(20).get())
      }
      return Promise.all(tasks)
    }).then(ress => {
      CLOUD = []
      ;(ress || []).forEach(r => CLOUD.push.apply(CLOUD, r.data || []))
      wx.setStorageSync(META_KEY, CLOUD)
      resolve(CLOUD)
    }).catch(err => {
      console.warn('加载云端书目失败', err)
      resolve(CLOUD)
    })
  })
}

// ---------- 整本下载（含自动更新） ----------
function fetchChapters(novelId) {
  if (!wx.cloud || !wx.cloud.database) return Promise.reject(new Error('云开发不可用'))
  const db = wx.cloud.database()
  const col = db.collection('novel_chapters')
  return col.where({ novelId }).count().then(r => {
    const total = r.total || 0
    if (!total) return Promise.reject(new Error('该书尚未发布章节'))
    const PAGE = 100
    const pages = Math.ceil(total / PAGE)
    const out = []
    const CONC = 4
    let idx = 0
    function worker() {
      while (idx < pages) {
        const i = idx++
        return col.where({ novelId }).skip(i * PAGE).limit(PAGE).get()
          .then(res => {
            ;(res.data || []).forEach(ch => {
              const o = Object.assign({}, ch)
              delete o._id
              out.push(o)
            })
          })
      }
      return Promise.resolve()
    }
    const workers = []
    for (let i = 0; i < Math.min(CONC, pages); i++) workers.push(worker())
    return Promise.all(workers).then(() => out)
  }).then(list => {
    list.sort((a, b) => (a.seq || 0) - (b.seq || 0))
    return list
  })
}

function saveToFile(novelId, payload) {
  try {
    try { fs.accessSync(DIR) } catch (e) { fs.mkdirSync(DIR, true) }
    fs.writeFileSync(`${DIR}/${novelId}.json`, JSON.stringify(payload), 'utf8')
  } catch (e) { console.warn('写入样书缓存失败', e) }
}

function targetVersion(novelId) {
  const s = getSampleBy(novelId)
  const c = CLOUD.find(x => x.novelId === novelId)
  const cv = (c && c.version) || 0
  const sv = (s && s.meta.version) || 0
  return Math.max(cv, sv)
}

// 下载（云端→本地文件）；version 用于记录更新
function download(novelId) {
  const meta = CLOUD.find(c => c.novelId === novelId)
  const version = (meta && meta.version) || targetVersion(novelId)
  return fetchChapters(novelId).then(chapters => {
    if (!chapters.length) throw new Error('章节为空')
    saveToFile(novelId, { version, chapters })
    const rec = downloadedRec()
    rec[novelId] = { version }
    wx.setStorageSync(DOWNLOADED_KEY, rec)
    return { chapters, version }
  })
}

// 打开书 → 返回章节数组（本地缓存 > 云端新版下载 > 内置样书）
function openBook(novelId) {
  ensureInit()
  const s = getSampleBy(novelId)
  const c = CLOUD.find(x => x.novelId === novelId)
  // 1) 本地文件且版本不落后 → 直接用
  const file = readLocalFile(novelId)
  if (file && file.chapters && file.version >= targetVersion(novelId)) {
    return Promise.resolve(file.chapters)
  }
  // 2) 云端存在且比内置新（或无内置）→ 拉最新
  if (c) {
    const needCloud = !s || (c.version || 1) > (s.meta.version || 1)
    if (needCloud) {
      return download(novelId).then(d => d.chapters)
    }
  }
  // 3) 内置样书保底
  if (s && file) return Promise.resolve(file.chapters)
  if (s) return Promise.resolve(s.chapters)
  return Promise.reject(new Error('书库中不存在该书'))
}

// 删除本地下载（保留阅读进度）
function remove(novelId) {
  const rec = downloadedRec()
  if (rec[novelId]) {
    delete rec[novelId]
    wx.setStorageSync(DOWNLOADED_KEY, rec)
  }
  try { fs.unlinkSync(`${DIR}/${novelId}.json`) } catch (e) {}
}

// ---------- 自动更新：true=开启（默认） ----------
function getAutoUpdate() {
  try {
    const v = wx.getStorageSync(AUTO_KEY)
    return v === '' ? true : !!v
  } catch (e) { return true }
}
function setAutoUpdate(on) { wx.setStorageSync(AUTO_KEY, !!on) }

// 逐本自动更新：对有版本更新的书静默拉取新版
function autoUpdate(progress) {
  if (!getAutoUpdate()) return Promise.resolve(0)
  const needs = CLOUD.filter(c => {
    const rec = localVersion(c.novelId)
    return rec > 0 && (c.version || 1) > rec
  })
  let done = 0
  let fail = 0
  let chain = Promise.resolve()
  needs.forEach(c => {
    chain = chain.then(() => download(c.novelId).then(() => {
      done++
      if (progress && typeof progress === 'function') progress(c, done, needs.length)
    }).catch(() => {
      fail++
    }))
  })
  return chain.then(() => done)
}

module.exports = {
  getBooks, loadCloudNovels, download, remove, openBook,
  getAutoUpdate, setAutoUpdate, autoUpdate, readLocalFile,
  SAMPLE_NOVELS: sampleBooks
}
