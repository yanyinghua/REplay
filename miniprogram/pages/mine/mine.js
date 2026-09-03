// pages/mine/mine.js
const store = require('../../utils/store.js')
const words = require('../../utils/wordbank.js')
const trending = require('../../utils/trending.js')
const ads = require('../../utils/ads.js')

const BADGE_DEFS = [
  { name: '初出茅庐', icon: '🌱', test: (s) => s.learned >= 10 },
  { name: '百词斩', icon: '⚔️', test: (s) => s.learned >= 30 },
  { name: '小有所成', icon: '📖', test: (s) => s.learned >= 100 },
  { name: '千词学霸', icon: '📚', test: (s) => s.learned >= 1000 },
  { name: '万词之王', icon: '👑', test: (s) => s.learned >= 10000 },
  { name: '七日不倒', icon: '🔥', test: (s) => s.streak >= 7 },
  { name: '进阶学者', icon: '🎓', test: (s) => s.level >= 3 },
  { name: '闯关达人', icon: '🏆', test: (s) => s.passedLevels >= 3 }
]

Page({
  data: { level: 1, expInLevel: 0, need: 200, expPercent: 0, coin: 0, streak: 0, learned: 0, badges: [], wrongCount: 0, hand: 'right', todayLearned: 0, bookStats: [], daily7: [], daily7Max: 0, interestText: '', nick: '', avatar: '', editing: false, editAvatar: '', editNick: '', vipCard: null },

  onShow() {
    this.refresh()
    // 会员卡依赖远程 ad_config.vip，拉到远程配置后再刷一次（失败回退缓存，无感）
    ads.loadConfig().then(() => this.refresh())
  },

  refresh() {
    const p = store.getProfile()
    // 统计已学词 & 通关数
    const prog = store.getProgress()
    let learned = 0, passedLevels = 0
    Object.keys(prog).forEach(bid => {
      learned += prog[bid].learned || 0
      const lv = prog[bid].levels || {}
      Object.keys(lv).forEach(k => { if (lv[k].passed) passedLevels++ })
    })
    const stats = { learned, streak: p.streak, level: p.level, passedLevels }
    const badges = BADGE_DEFS.filter(b => b.test(stats)).map(b => ({ name: b.name, icon: b.icon }))
    this.setData({
      level: p.level, expInLevel: p.exp % 200, need: 200,
      expPercent: Math.round((p.exp % 200) / 200 * 100),
      coin: p.coin, streak: p.streak, learned, badges,
      wrongCount: store.getWrongWordIds().length,
      hand: store.getHandMode(),
      todayLearned: store.getTodayLearned(),
      bookStats: this.buildBookStats(prog),
      daily7: store.getRecentDaily(7),
      interestText: trending.interestText(),
      nick: (p && p.nickName) || '',
      avatar: (p && p.avatarUrl) || '',
      vipCard: this.buildVipCard()
    })
    this.setData({ daily7Max: this.data.daily7.reduce((m, d) => Math.max(m, d.count), 0) })
  },

  // 会员/去广告状态卡：仅在远程开启 vip 且存在可展示权益时显示
  buildVipCard() {
    const cfg = ads.getConfig().vip || {}
    if (!cfg.on) return null
    const p = store.getProfile() || {}
    const hasVip = Number(p.vipUntil) > Date.now()
    const trial = Number(cfg.trialDays) || 0
    const quota = Number(cfg.skipQuota) || 0
    if (!hasVip && !trial && !quota) return null // 权益全关，不展示空卡片

    const v = ads.vipStatus()
    const coinTxt = '免插屏广告 · 金币免看直发'
    const skipsLeft = v.skipsLeft || 0
    const quotaTxt = quota > 0 ? ' · 免广告券剩 ' + skipsLeft + ' 张' : ''

    if (v.free) {
      if (v.reason === 'vip') {
        const d = Math.max(1, Math.ceil(v.vipLeft / 86400000))
        return {
          icon: '👑', tag: 'VIP', title: 'VIP 会员生效中', desc: coinTxt,
          foot: '剩余 ' + d + ' 天' + quotaTxt, active: true
        }
      }
      if (v.reason === 'trial') {
        const d = Math.max(1, Math.ceil(v.trialLeft / 86400000))
        return {
          icon: '🎁', tag: '新人体验', title: '体验期还剩 ' + d + ' 天', desc: coinTxt,
          foot: quotaTxt ? quotaTxt.slice(3) : '到期后可获赠免广告券', active: true
        }
      }
      return {
        icon: '🎟️', tag: '免广告券', title: '可用 ' + skipsLeft + ' 张', desc: '每免一次插屏广告 / 免看领金币消耗 1 张',
        foot: '券用尽后恢复低频广告', active: true
      }
    }
    // vip 已开启但当前无生效权益
    return {
      icon: '📡', tag: '去广告', title: '暂无生效的免广告权益',
      desc: '广告按 60s 冷却 + 每日每场景低频出现，不影响学习',
      foot: hasVip ? '会员即将失效，续费后可继续免广告' : (quota > 0 ? '免广告券已用完' : '新人体验已结束'), active: false
    }
  },

  // 会员卡点击：未来放「会员中心」；当前先做权益说明
  goVip() {
    wx.showModal({
      title: (this.data.vipCard && this.data.vipCard.active) ? '免广告权益生效中' : '去广告权益',
      content: '体验期内 / VIP / 持免广告券的用户：闯关插屏广告不再打扰，首页金币免看视频直接领取。\n\n正式会员购买通道上线后，可在这里查看与续费。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 各词库已学进度统计
  buildBookStats(prog) {
    return words.getBooks()
      .filter(b => b.downloaded)
      .map(b => {
        const learned = ((prog || {})[b.bookId] || {}).learned || 0
        const total = b.wordCount || 0
        return {
          bookId: b.bookId, emoji: b.emoji, name: b.name,
          total, learned, percent: total ? Math.round(learned / total * 100) : 0
        }
      })
      .filter(s => s.learned > 0)
      .sort((a, b) => b.percent - a.percent)
  },

  goMistakes() { wx.navigateTo({ url: '/pages/mistakes/mistakes' }) },
  goCurve() { wx.navigateTo({ url: '/pages/curve/curve' }) },
  goInterests() { wx.navigateTo({ url: '/pages/interests/interests' }) },

  // ---------- 编辑资料：微信官方「头像昵称填写能力」（chooseAvatar + input type=nickname） ----------
  openEdit() {
    this.setData({ editing: true, editAvatar: this.data.avatar || '', editNick: this.data.nick || '' })
  },
  closeEdit() { this.setData({ editing: false }) },
  noop() {},
  onChooseAvatar(e) {
    const t = (e.detail && e.detail.avatarUrl) || ''
    if (t) this.setData({ editAvatar: t })
  },
  onNickInput(e) { this.setData({ editNick: e.detail.value }) },
  saveInfo() {
    const nick = (this.data.editNick || '').trim()
    const cur = this.data.avatar || ''
    const picked = this.data.editAvatar || ''
    const nickChanged = nick !== (this.data.nick || '')
    const avatarChanged = !!picked && picked !== cur
    if (!nickChanged && !avatarChanged) {
      wx.showToast({ title: '还没有修改内容', icon: 'none' })
      return
    }
    const persist = (avatarUrl) => {
      const p = store.getProfile()
      if (nick) p.nickName = nick
      else delete p.nickName
      if (avatarUrl) p.avatarUrl = avatarUrl
      store.saveProfile(p) // 内部会触发云同步（user-sync）
      this.setData({ editing: false, avatar: avatarUrl || cur, nick })
      wx.showToast({ title: '已保存', icon: 'success' })
    }
    // 头像选了新图（本地临时文件）→ 上传云存储拿 fileID，换设备/重装后也能显示
    if (avatarChanged && picked.indexOf('cloud://') !== 0) {
      wx.showLoading({ title: '上传头像…', mask: true })
      const dot = picked.lastIndexOf('.')
      const ext = dot > -1 ? picked.slice(dot + 1).split('?')[0].toLowerCase() : 'png'
      wx.cloud.uploadFile({
        cloudPath: 'avatars/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext,
        filePath: picked
      }).then(res => {
        wx.hideLoading()
        persist((res && res.fileID) || picked)
      }).catch(() => {
        wx.hideLoading()
        persist(picked) // 云上传失败：先本地生效，之后随 profile 上云（临时路径仅本机可见）
      })
      return
    }
    persist(picked)
  },

  setHand(e) {
    const hand = e.currentTarget.dataset.hand
    store.setHandMode(hand)
    this.setData({ hand })
    wx.showToast({ title: hand === 'left' ? '已切换左手模式' : '已切换右手模式', icon: 'none' })
  },

  reset() {
    wx.showModal({
      title: '清空进度', content: '确定清空本地学习与积分数据？',
      success: (r) => {
        if (!r.confirm) return
        wx.removeStorageSync('srs_state')
        wx.removeStorageSync('user_profile')
        wx.removeStorageSync('book_progress')
        wx.removeStorageSync('daily_learn')
        wx.setStorageSync('srs_state', {})
        wx.setStorageSync('user_profile', { exp: 0, level: 1, coin: 0, streak: 0, lastCheckin: 0, badges: [], createdAt: Date.now() })
        wx.setStorageSync('book_progress', {})
        wx.showToast({ title: '已清空', icon: 'success' })
        this.refresh()
      }
    })
  }
})
