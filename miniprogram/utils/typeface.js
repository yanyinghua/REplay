// utils/typeface.js —— 全局字体偏好：预设 + 存取（阅读 / 学习 / 测验共用一套）
// font-family 内用单引号，避免与 WXML style 的双引号冲突
const KEY = 'reading_font_family'
const DAILY_KEY = 'typeface_daily'
const MANUAL_KEY = 'typeface_manual_date'

const FONTS = [
  {
    id: 'sans', name: '现代 · 简约', emoji: '🔤',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
  },
  {
    id: 'serif', name: '经典衬线 · 名著', emoji: '📜',
    stack: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', serif"
  },
  {
    id: 'round', name: '圆润 · 轻松', emoji: '🎈',
    stack: "'Chalkboard SE', 'Marker Felt', 'Comic Sans MS', 'Kaiti SC', cursive"
  },
  {
    id: 'type', name: '打字机 · 复古', emoji: '⌨️',
    stack: "'Courier New', 'American Typewriter', Menlo, Consolas, monospace"
  },
  {
    id: 'hand', name: '手写 · 随笔', emoji: '✍️',
    stack: "'Snell Roundhand', 'Bradley Hand', 'HanziPen SC', 'Kaiti SC', 'KaiTi', cursive"
  }
]

function stackOf(id) {
  const f = FONTS.find(x => x.id === id)
  return f ? f.stack : FONTS[0].stack
}

function currentId() {
  let id = FONTS[0].id
  try {
    const saved = wx.getStorageSync(KEY)
    if (FONTS.some(f => f.id === saved)) id = saved
  } catch (e) {}
  return id
}

function loadStack() {
  return stackOf(currentId())
}

function todayStr() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 保存用户选择的字体；manual=false 表示内部（彩蛋）写入，不算“用户手动选择”
function saveById(id, manual) {
  try {
    wx.setStorageSync(KEY, id)
    if (manual !== false) wx.setStorageSync(MANUAL_KEY, todayStr())
  } catch (e) {}
}

// 每日字体彩蛋：当天第一次调用时自动换一款不同于当前的字体；
// 若今天已换过，或今天用户已手动选过字体，则返回 null（不打扰）
function dailyPick() {
  try {
    const today = todayStr()
    const rec = wx.getStorageSync(DAILY_KEY)
    if (rec && rec.date === today) return null
    if (wx.getStorageSync(MANUAL_KEY) === today) return null
    const cur = currentId()
    const pool = FONTS.filter(f => f.id !== cur)
    const f = pool[Math.floor(Math.random() * pool.length)]
    saveById(f.id, false)
    try { wx.setStorageSync(DAILY_KEY, { date: today, id: f.id }) } catch (e) {}
    return f
  } catch (e) { return null }
}

module.exports = { FONTS, KEY, stackOf, currentId, loadStack, saveById, dailyPick }
