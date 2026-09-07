// pages/pkroom/pkroom.js —— 实时对战页（watch + 抢答 + 倒计时）
// 流程：login 取 openid → match 建房/匹配 → watch(roomId) → 2 人后 start → 抢答
// 答案/计分/推进全在服务端（cloudfunctions/pk），本页只渲染与提交
const T = 8000 // 必须与云函数 pkLogic.T 一致
const DB = wx.cloud.database()
const store = require('../../utils/store.js')

Page({
  data: {
    status: 'matching', // matching | waiting | playing | finished
    bookId: 'daily', level: 0, solo: false, roomId: '', roomIdPretty: '',
    oppOffline: false,
    myOpenid: '',
    myScore: 0, oppName: '对手', oppScore: 0,
    qIndex: 0, total: 0,
    current: null,         // {emoji, meaning, phonetic, options}
    selected: -1, answered: false, locked: false,
    timeLeft: 0,
    feedback: '', banner: '',
    overlay: { show: false, win: false, draw: false, my: 0, opp: 0 }
  },

  _watcher: null, _timer: null, _hbTimer: null, _hbStarted: false,
  _starting: false, _lastQ: -1, _timeoutFired: false,

  onLoad(q) {
    const bookId = q.bookId || 'daily'
    const level = Number(q.level || 0)
    const solo = q.solo === '1'
    // 好友从邀请卡片点进来：携带 roomId，匹配时直接入座这间房
    let joinRoomId = ''
    if (q.roomId) {
      try { joinRoomId = decodeURIComponent(q.roomId) } catch (e) { joinRoomId = q.roomId }
    }
    this.setData({ bookId, level, solo })
    this._joinRoomId = joinRoomId
    this._resultCalled = false
    this._localRewarded = false
    this.bootstrap()
  },

  async bootstrap() {
    // 取 openid（同时建云端档案），再匹配
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      this.setData({ myOpenid: res.result.openid })
    } catch (e) { console.error('login fail', e) }
    this.match()
  },

  match() {
    const payload = { action: 'match', bookId: this.data.bookId, level: this.data.level }
    if (this._joinRoomId) payload.roomId = this._joinRoomId // 被邀请：直接入座指定房间
    wx.cloud.callFunction({
      name: 'pk',
      data: payload
    }).then(res => {
      const rr = res.result || {}
      if (rr.error) {
        // 邀请的房间已失效（已开局/已关闭）→ 退回普通匹配，不让好友干等
        if (this._joinRoomId) {
          this._joinRoomId = ''
          wx.showToast({ title: '房间已失效，为你匹配新对手', icon: 'none' })
          return this.match()
        }
        wx.showToast({ title: '匹配失败', icon: 'none' })
        return
      }
      const roomId = rr.roomId
      if (!roomId) { wx.showToast({ title: '匹配失败', icon: 'none' }); return }
      // 房间号每 4 位一组展示，方便识读与核对（复制时仍复制完整房号）
      const pretty = roomId.replace(/(.{4})/g, '$1 ').trim()
      this.setData({ roomId, roomIdPretty: pretty })
      if (this.data.solo) {
        wx.cloud.callFunction({ name: 'pk', data: { action: 'start', roomId, allowSolo: true } })
      }
      this.startWatch(roomId)
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '匹配出错', icon: 'none' })
    })
  },

  // 一键复制房间号：点房间卡片或「复制」按钮都触发
  copyRoomId() {
    const id = this.data.roomId
    if (!id) return
    wx.setClipboardData({
      data: id,
      success: () => wx.showToast({ title: '房间号已复制，去粘贴发给好友吧', icon: 'none' })
    })
  },

  // 邀请卡片：好友点开后自动带 roomId 入座本房间，无需手输房间号
  onShareAppMessage() {
    const { roomId, bookId, level, status } = this.data
    const base = `/pages/pkroom/pkroom?bookId=${bookId}&level=${level}`
    const path = roomId && (status === 'matching' || status === 'waiting')
      ? `${base}&roomId=${encodeURIComponent(roomId)}`
      : base
    return { title: '⚔️ 来和我单词 PK，看谁记得牢！', path }
  },

  startWatch(roomId) {
    if (this._watcher) return
    this._watcher = DB.collection('pk_rooms').doc(roomId).watch({
      onChange: snap => this.onChange(snap),
      onError: err => {
        console.error('watch error', err)
        // 断线：关闭旧监听，2s 后尝试重连（SDK 也会自动重连，这里兜底）
        if (this._watcher) { try { this._watcher.close() } catch (e) {} this._watcher = null }
        if (!this._reconnecting) {
          this._reconnecting = true
          setTimeout(() => {
            this._reconnecting = false
            if (this.data.roomId && this.data.status !== 'finished') this.startWatch(this.data.roomId)
          }, 2000)
        }
      }
    })
  },

  onChange(snap) {
    const room = snap.docs && snap.docs[0]
    if (!room) return
    // 满 2 人且我是房主 → 开局（只触发一次）
    if (room.status === 'waiting' && (room.players || []).length >= 2 &&
        !this._starting && this.data.myOpenid &&
        room.players[0]._openid === this.data.myOpenid) {
      this._starting = true
      wx.cloud.callFunction({ name: 'pk', data: { action: 'start', roomId: this.data.roomId } })
    }
    this.render(room)
  },

  render(room) {
    const players = room.players || []
    const me = players.find(p => p._openid === this.data.myOpenid) || {}
    const opp = players.find(p => p._openid !== this.data.myOpenid) || {}
    const total = (room.questionPool || []).length
    const isPlaying = room.status === 'playing'
    const newQ = room.qIndex !== this._lastQ

    let current = null, timeLeft = 0
    if (isPlaying && room.questionPool && room.questionPool[room.qIndex]) {
      current = room.questionPool[room.qIndex].display
      const remain = (room.roundStart + T) - Date.now()
      timeLeft = Math.max(0, Math.ceil(remain / 1000))
    }

    // 新一题：重置本地作答态，启动倒计时
    let answered = this.data.answered, selected = this.data.selected, locked = this.data.locked
    let banner = this.data.banner
    if (isPlaying && newQ) {
      answered = false; selected = -1; locked = false
      this._lastQ = room.qIndex
      this._timeoutFired = false
      // 上一轮结果提示
      const lr = room.lastRound
      if (lr && lr.winner === this.data.myOpenid) banner = '🎯 你抢到了！'
      else if (lr && lr.winner) banner = '⚡ 对方抢到了'
      else if (lr) banner = '⏱ 超时，无人答对'
      else banner = ''
      this.startTimer(room)
    }
    if (me.locked && !newQ) locked = true

    // 心跳 + 对手离线检测（双方各自上报 lastSeen，>15s 视为离线）
    let oppOffline = this.data.oppOffline
    if (isPlaying) {
      this.startHeartbeat()
      const hb = room.heartbeats || {}
      const myHb = hb[this.data.myOpenid] || 0
      const oppHb = opp._openid ? (hb[opp._openid] || 0) : 0
      oppOffline = !!myHb && (!oppHb || Date.now() - oppHb > 15000)
    } else if (room.status === 'finished') {
      oppOffline = false
    }

    // 反馈文案
    let feedback = this.data.feedback
    if (isPlaying && me.answers && me.answers.qIndex === room.qIndex) {
      feedback = me.answers.correct ? '✅ 你答对了' : '❌ 答错了，等待对方'
    } else if (isPlaying) {
      feedback = '选择答案，抢答！'
    }

    this.setData({
      status: room.status,
      myScore: me.score || 0,
      oppName: opp.nickName || '对手', oppScore: opp.score || 0,
      qIndex: room.qIndex, total,
      current, timeLeft,
      selected, answered, locked, banner, feedback, oppOffline
    })

    if (room.status === 'finished') {
      this.stopTimer()
      const win = room.winner === this.data.myOpenid
      const draw = !room.winner
      const ov = { show: true, win, draw, my: me.score || 0, opp: opp.score || 0 }
      if (room.result) {
        // 结果已由任一方结算完成（watch 推回）
        this.applyReward(room.result)
      } else if (!this._resultCalled) {
        this._resultCalled = true
        this.callResult()
      }
      this.setData({ overlay: ov })
    }
  },

  // 把结算奖励写入本地展示（并临时桥接本地经验/金币，待 M3.0 syncProfile 统一）
  applyReward(payload) {
    const me = this.data.myOpenid
    const rw = (payload.rewards && payload.rewards[me]) || {}
    const badge = payload.newBadges && payload.newBadges[me]
    if (!this._localRewarded && (rw.exp || rw.coin)) {
      this._localRewarded = true
      store.addReward(rw.exp || 0, rw.coin || 0)
    }
    this.setData({
      'overlay.myExp': rw.exp || 0,
      'overlay.myCoin': rw.coin || 0,
      'overlay.badge': (badge && badge.length) ? ('🏅 解锁徽章：' + badge.join('、')) : ''
    })
  },

  callResult() {
    wx.cloud.callFunction({ name: 'pk', data: { action: 'result', roomId: this.data.roomId } })
      .then(res => {
        const payload = res.result && res.result.result
        if (payload) this.applyReward(payload)
      }).catch(err => console.error('result fail', err))
  },

  startTimer(room) {
    this.stopTimer()
    this._timer = setInterval(() => {
      const remain = (room.roundStart + T) - Date.now()
      const tl = Math.max(0, Math.ceil(remain / 1000))
      this.setData({ timeLeft: tl })
      if (remain <= 0) {
        this.stopTimer()
        if (!this._timeoutFired) {
          this._timeoutFired = true
          wx.cloud.callFunction({ name: 'pk', data: { action: 'timeout', roomId: this.data.roomId } }).catch(() => {})
        }
      }
    }, 100)
  },

  onChoose(e) {
    if (this.data.answered || this.data.locked || this.data.status !== 'playing') return
    const opt = Number(e.currentTarget.dataset.opt)
    this.setData({ answered: true, selected: opt })
    wx.cloud.callFunction({
      name: 'pk',
      data: { action: 'answer', roomId: this.data.roomId, qIndex: this.data.qIndex, optionIndex: opt }
    }).catch(err => console.error(err))
  },

  stopTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null } },

  // 心跳：每 3s 上报 lastSeen，供对手判断离线
  startHeartbeat() {
    if (this._hbStarted) return
    this._hbStarted = true
    this._hbTimer = setInterval(() => {
      if (this.data.status !== 'playing') { this.stopHeartbeat(); return }
      wx.cloud.callFunction({ name: 'pk', data: { action: 'heartbeat', roomId: this.data.roomId } }).catch(() => {})
    }, 3000)
  },
  stopHeartbeat() {
    if (this._hbTimer) { clearInterval(this._hbTimer); this._hbTimer = null }
    this._hbStarted = false
  },

  // 退出/断线：本人弃权，对手判胜并结算
  quitGame() {
    wx.cloud.callFunction({ name: 'pk', data: { action: 'quit', roomId: this.data.roomId } }).catch(() => {})
    this.stopHeartbeat()
    setTimeout(() => this.back(), 800)
  },

  restart() {
    this.quitIfPlaying()
    if (this._watcher) { this._watcher.close(); this._watcher = null }
    this._lastQ = -1; this._starting = false; this._timeoutFired = false
    this._resultCalled = false; this._localRewarded = false
    this._reconnecting = false
    this._joinRoomId = '' // 再来一局：重新普通匹配，不再回到原邀请房间
    this.stopTimer(); this.stopHeartbeat()
    this.setData({
      status: 'matching', current: null, selected: -1, answered: false, locked: false,
      oppOffline: false, banner: '', feedback: '', overlay: { show: false }
    })
    this.match()
  },

  // 仍在游戏中离开 → 调 quit 让对手获胜（已结束则幂等返回）
  quitIfPlaying() {
    if (this.data.status === 'playing' || this.data.status === 'waiting') {
      wx.cloud.callFunction({ name: 'pk', data: { action: 'quit', roomId: this.data.roomId } }).catch(() => {})
    }
    this.stopHeartbeat()
  },

  back() { this.quitIfPlaying(); wx.switchTab({ url: '/pages/home/home' }) },

  onUnload() {
    if (this._watcher) { try { this._watcher.close() } catch (e) {} this._watcher = null }
    this.stopTimer(); this.stopHeartbeat()
    this.quitIfPlaying()
  }
})
