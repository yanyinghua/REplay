// pages/curve/curve.js —— 记忆曲线可视化（canvas 2d）
const store = require('../../utils/store.js')
const ret = require('../../utils/retention.js')
const srs = require('../../utils/srs.js')

Page({
  data: { hasData: false, current: 0, learned: 0, urgent: 0 },

  onShow() { this.compute() },
  onReady() { this.compute() }, // 画布首次布局完成后绘制

  compute() {
    const state = wx.getStorageSync('srs_state') || {}
    const ids = Object.keys(state)
    const now = Date.now()
    const current = Math.round(ret.overallRetention(state, now) * 100)
    let urgent = 0
    ids.forEach(id => {
      if (ret.wordRetention(state[id], now + 7 * srs.DAY) < 0.6) urgent++
    })
    this.setData({
      hasData: ids.length > 0,
      current, learned: ids.length, urgent
    })
    if (ids.length) {
      this.proj = ret.projection(state, 30, now)
      this.draw()
    }
  },

  draw() {
    const q = wx.createSelectorQuery()
    q.select('#curve').fields({ node: true, size: true }).exec(res => {
      if (!res[0] || !res[0].node) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || wx.getSystemInfoSync().pixelRatio || 2
      const W = res[0].width, H = res[0].height
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)
      this.render(ctx, W, H, this.proj)
    })
  },

  render(ctx, W, H, pts) {
    ctx.clearRect(0, 0, W, H)
    const padL = 36, padR = 12, padT = 16, padB = 24
    const cw = W - padL - padR, ch = H - padT - padB
    const days = pts.length - 1
    const X = d => padL + cw * (d / days)
    const Y = r => padT + ch * (1 - Math.max(0, Math.min(1, r)))

    // 网格 + Y 轴标签
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#9aa0b4'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let p = 0; p <= 100; p += 25) {
      const y = Y(p / 100)
      ctx.strokeStyle = '#eef0f6'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke()
      ctx.fillText(p + '%', padL - 4, y)
    }
    // X 轴标签
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ;[0, Math.round(days / 2), days].forEach(d => {
      ctx.fillText(d === 0 ? '今天' : ('+' + d + '天'), X(d), H - padB + 4)
    })

    // 面积填充
    ctx.beginPath()
    ctx.moveTo(X(0), Y(pts[0]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(X(i), Y(pts[i]))
    ctx.lineTo(X(days), padT + ch)
    ctx.lineTo(X(0), padT + ch)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, padT, 0, padT + ch)
    grad.addColorStop(0, 'rgba(79,110,247,0.28)')
    grad.addColorStop(1, 'rgba(79,110,247,0.02)')
    ctx.fillStyle = grad; ctx.fill()

    // 曲线
    ctx.beginPath()
    ctx.moveTo(X(0), Y(pts[0]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(X(i), Y(pts[i]))
    ctx.strokeStyle = '#4f6ef7'; ctx.lineWidth = 2.5; ctx.stroke()

    // 今天标记点
    ctx.beginPath()
    ctx.arc(X(0), Y(pts[0]), 4, 0, Math.PI * 2)
    ctx.fillStyle = '#4f6ef7'; ctx.fill()
  },

  goStudy() { wx.switchTab({ url: '/pages/books/books' }) }
})
