// scripts/test-rank.js
// 端到端契约联调：前端页面 miniprogram/pages/rank/rank.js
//   <-> 真实云函数 cloudfunctions/rank/index.js
// 不依赖微信环境：同时 mock 微信客户端(wx) 与 云数据库(wx-server-sdk)，
// 跑通 onLoad → login → sync → getRank，验证前后端数据结构一致。
//
// 用法：npm run test:rank
// 说明：这是「契约联调」，不等同于真机/模拟器联调；真实部署见 README 与对话记录。

const Module = require('module')
const path = require('path')

const OPENID = 'me_openid'
const RANK_FN = path.join(__dirname, '..', 'cloudfunctions', 'rank', 'index.js')
const RANK_PAGE = path.join(__dirname, '..', 'miniprogram', 'pages', 'rank', 'rank.js')

/* ---------------- 云侧：内存数据库 + wx-server-sdk mock ---------------- */
const CLOUD = {
  users: [
    { _openid: 'a', nickName: 'A', exp: 300, streak: 5, bookProgress: { daily: { stars: 3 } } },
    { _openid: 'b', nickName: 'B', exp: 100, streak: 2, bookProgress: { daily: { stars: 1 } } },
    { _openid: OPENID, nickName: 'Me', exp: 0, streak: 0, bookProgress: {}, learnedTotal: 0 },
  ],
  friends: [],
}

const cmd = {
  gt: (v) => ({ __op: 'gt', v }),
  in: (arr) => ({ __op: 'in', v: arr }),
  or: (arr) => ({ __op: 'or', v: arr }),
  neq: (v) => ({ __op: 'neq', v }),
}

function getVal(r, field) {
  if (field.includes('.')) {
    let o = r
    for (const p of field.split('.')) {
      o = o && o[p]
      if (o == null) return 0
    }
    return o || 0
  }
  return r[field] || 0
}

function matchWhere(r, w) {
  for (const k of Object.keys(w)) {
    const c = w[k]
    const fv = getVal(r, k)
    if (c && c.__op === 'gt') {
      if (!(fv > c.v)) return false
    } else if (c && c.__op === 'in') {
      if (!c.v.includes(fv)) return false
    } else if (c && c.__op === 'or') {
      if (!c.v.some((s) => matchWhere(r, s))) return false
    } else if (c && c.__op === 'neq') {
      if (fv === c.v) return false
    } else if (fv !== c) {
      return false
    }
  }
  return true
}

// 不可变查询：每次链式调用返回新 Query（与真实 wx-server-sdk 行为一致）
function makeQuery(name, base) {
  const s = Object.assign({ wheres: [], orders: [], limitN: 1000 }, base || {})
  const run = (op, payload) => {
    let rows = CLOUD[name].slice()
    for (const w of s.wheres) rows = rows.filter((r) => matchWhere(r, w))
    for (const o of s.orders)
      rows.sort((x, y) =>
        o.dir === 'desc' ? getVal(y, o.field) - getVal(x, o.field) : getVal(x, o.field) - getVal(y, o.field)
      )
    if (op === 'count') return { total: rows.length }
    if (op === 'add') {
      const id = 'id' + Math.random()
      CLOUD[name].push(Object.assign({ _id: id }, payload.data))
      return { _id: id }
    }
    if (op === 'update') {
      for (const w of s.wheres) {
        const i = CLOUD[name].findIndex((r) => matchWhere(r, w))
        if (i >= 0) CLOUD[name][i] = Object.assign({}, CLOUD[name][i], payload.data)
      }
      return { stats: { updated: 1 } }
    }
    return { data: rows.slice(0, s.limitN) }
  }
  return {
    orderBy(f, d) {
      return makeQuery(name, { wheres: s.wheres, orders: s.orders.concat([{ field: f, dir: d }]), limitN: s.limitN })
    },
    where(w) {
      return makeQuery(name, { wheres: s.wheres.concat([w]), orders: s.orders, limitN: s.limitN })
    },
    limit(n) {
      return makeQuery(name, { wheres: s.wheres, orders: s.orders, limitN: n })
    },
    get() {
      return run('get')
    },
    count() {
      return run('count')
    },
    add(d) {
      return run('add', d)
    },
    update(d) {
      return run('update', d)
    },
    doc() {
      return { get: () => ({ data: null }) }
    },
  }
}

const wxServerSdk = {
  init: () => {},
  database: () => ({ command: cmd, collection: (n) => makeQuery(n) }),
  getWXContext: () => ({ OPENID }),
}

const origLoad = Module._load
Module._load = function (req, p, m) {
  return req === 'wx-server-sdk' ? wxServerSdk : origLoad.call(this, req, p, m)
}

/* ---------------- 前端侧：mock wx ---------------- */
const storage = new Map()
storage.set('user_profile', { exp: 200, streak: 9, level: 1, coin: 0, lastCheckin: 0, badges: [] })
storage.set('book_progress', {
  daily: { levels: { 0: { stars: 2 }, 1: { stars: 3 } }, learned: 20 },
  cet4: { levels: { 0: { stars: 1 } }, learned: 10 },
})
global.wx = {
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  setStorageSync: (k, v) => storage.set(k, v),
  cloud: {
    callFunction: ({ name, data }) => {
      if (name === 'login') return Promise.resolve({ result: { openid: OPENID } })
      if (name === 'rank') return require(RANK_FN).main(data).then((result) => ({ result }))
      return Promise.resolve({ result: {} })
    },
  },
  showToast: () => {},
  stopPullDownRefresh: () => {},
}

/* ---------------- 捕获 Page 实例并注入 setData ---------------- */
let pageInstance = null
global.Page = (opts) => {
  pageInstance = opts
}
require(RANK_PAGE)
pageInstance.setData = function (patch, cb) {
  Object.assign(this.data, patch)
  if (cb) cb()
}

/* ---------------- 断言运行 ---------------- */
let fails = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('❌ ' + msg)
    fails++
  } else {
    console.log('✓ ' + msg)
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  await pageInstance.onLoad() // login → sync → getRank
  await sleep(60)
  const d = pageInstance.data
  assert(d.board.length === 3, '总榜拉取 3 人（含我）')
  assert(d.board[0].openid === 'a' && d.board[0].value === 300, '总榜榜首 a=300')
  assert(d.me.rank === 2 && d.me.value === 200, '总榜我的排名=2 经验=200 (实得 rank=' + d.me.rank + ' value=' + d.me.value + ')')
  assert(d.unit === '经验', '单位=经验')
  assert(d.topValue === 300, 'topValue=300')

  // 坚持榜
  pageInstance.onSwitchScope({ currentTarget: { dataset: { scope: 'streak' } } })
  await sleep(60)
  assert(pageInstance.data.board[0].openid === OPENID, '坚持榜我排第一')
  assert(pageInstance.data.unit === '天', '坚持榜单位=天')

  // 词库榜 daily：验证 sync 把本地关卡星星上云
  pageInstance.setData({ scope: 'book', bookId: 'daily' })
  pageInstance.onSwitchBook({ detail: { value: 0 } })
  await sleep(60)
  assert(pageInstance.data.me.value === 3, '词库榜我 3 星（本地关卡同步上云）实得=' + pageInstance.data.me.value)
  assert(pageInstance.data.unit === '⭐', '词库榜单位=⭐')

  // 仅看好友（M3.2 前无好友 → 回退全量并提示）
  pageInstance.onToggleFriend({ detail: { value: true } })
  await sleep(60)
  assert(pageInstance.data.board.length === 3, '无好友→回退全量 3 人')
  assert(/关注/.test(pageInstance.data.friendTip), '展示「关注」提示')

  if (pageInstance._timer) clearInterval(pageInstance._timer)

  console.log(fails === 0 ? '\n✅ 前端 rank.js ↔ 云函数 rank 端到端联调通过' : '\n❌ ' + fails + ' 项失败')
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => {
  console.error('❌ 异常', e)
  process.exit(1)
})
