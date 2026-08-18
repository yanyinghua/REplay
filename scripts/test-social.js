// scripts/test-social.js
// M3.2 社交契约联调（无微信环境）：mock wx-server-sdk，跑 follow / class 云函数，
// 并验证 M3.1 rank 的 friends / classId 过滤现在真实生效。
// 用法：npm run test:social
const Module = require('module')
const path = require('path')

const OPENID = 'me_openid'
const RANK_FN = path.join(__dirname, '..', 'cloudfunctions', 'rank', 'index.js')
const FOLLOW_FN = path.join(__dirname, '..', 'cloudfunctions', 'follow', 'index.js')
const CLASS_FN = path.join(__dirname, '..', 'cloudfunctions', 'class', 'index.js')

const CLOUD = {
  users: [
    { _openid: 'a', nickName: 'A', exp: 300, level: 4, avatar: '' },
    { _openid: 'b', nickName: 'B', exp: 100, level: 2, avatar: '' },
    { _openid: OPENID, nickName: 'Me', exp: 200, level: 3, avatar: '', bookProgress: {}, learnedTotal: 0 },
  ],
  friends: [],
  classes: [
    { _id: 'classX', name: '尖刀连', owner: 'a', members: ['a', 'b', OPENID], goalText: '冲冲冲', createAt: 1 },
  ],
}

const cmd = {
  gt: (v) => ({ __op: 'gt', v }),
  in: (arr) => ({ __op: 'in', v: arr }),
  or: (arr) => ({ __op: 'or', v: arr }),
  neq: (v) => ({ __op: 'neq', v }),
  push: (v) => ({ __op: 'push', v }),
  pull: (v) => ({ __op: 'pull', v }),
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
  return r[field]
}

function matchWhere(r, w) {
  if (w && w.__op === 'or') {
    return w.v.some((sub) => matchWhere(r, sub))
  }
  for (const k of Object.keys(w)) {
    const c = w[k]
    const fv = getVal(r, k)
    if (c && c.__op === 'gt') {
      if (!(fv > c.v)) return false
    } else if (c && c.__op === 'in') {
      if (!c.v.includes(fv)) return false
    } else if (c && c.__op === 'neq') {
      if (fv === c.v) return false
    } else if (c && c.__op === 'regex') {
      if (!new RegExp(c.source, c.opts).test(fv)) return false
    } else if (Array.isArray(fv) && fv.includes(c)) {
      // 数组字段的成员匹配（如 members: openid）
      continue
    } else if (fv !== c) {
      return false
    }
  }
  return true
}

// 不可变查询
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
    if (op === 'get') return { data: rows.slice(0, s.limitN) }
    if (op === 'add') {
      const id = 'id' + Math.random()
      CLOUD[name].push(Object.assign({ _id: id }, payload.data))
      return { _id: id }
    }
    if (op === 'remove') {
      const before = CLOUD[name].length
      CLOUD[name] = CLOUD[name].filter((r) => !matchWhere(r, s.wheres[0] || {}))
      return { stats: { removed: before - CLOUD[name].length } }
    }
    if (op === 'update') {
      for (const w of s.wheres) {
        CLOUD[name].forEach((r) => {
          if (matchWhere(r, w)) {
            for (const k in payload.data) {
              const v = payload.data[k]
              if (v && v.__op === 'push') r[k] = (r[k] || []).concat([v.v])
              else if (v && v.__op === 'pull') r[k] = (r[k] || []).filter((x) => x !== v.v)
              else r[k] = v
            }
          }
        })
      }
      return { stats: { updated: 1 } }
    }
    return { data: rows.slice(0, s.limitN) }
  }
  return {
    where(w) {
      return makeQuery(name, { wheres: s.wheres.concat([w]), orders: s.orders, limitN: s.limitN })
    },
    orderBy(f, d) {
      return makeQuery(name, { wheres: s.wheres, orders: s.orders.concat([{ field: f, dir: d }]), limitN: s.limitN })
    },
    limit(n) {
      return makeQuery(name, { wheres: s.wheres, orders: s.orders, limitN: n })
    },
    field() {
      return makeQuery(name, s) // 投影在 mock 中忽略
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
    remove() {
      return run('remove')
    },
    doc(id) {
      const find = () => CLOUD[name].find((x) => x._id === id)
      const apply = (data) => {
        const r = find()
        if (!r) return
        for (const k in data) {
          const v = data[k]
          if (v && v.__op === 'push') r[k] = (r[k] || []).concat([v.v])
          else if (v && v.__op === 'pull') r[k] = (r[k] || []).filter((x) => x !== v.v)
          else r[k] = v
        }
      }
      return {
        get: () => ({ data: find() || null }),
        update: (d) => {
          apply(d.data)
          return { stats: { updated: 1 } }
        },
        remove: () => {
          CLOUD[name] = CLOUD[name].filter((x) => x._id !== id)
          return { stats: { removed: 1 } }
        },
      }
    },
  }
}

const wxServerSdk = {
  init: () => {},
  database: () => ({
    command: cmd,
    RegExp: (o) => ({ __op: 'regex', source: o.regexp, opts: o.options }),
    collection: (n) => makeQuery(n),
  }),
  getWXContext: () => ({ OPENID }),
}
const origLoad = Module._load
Module._load = function (req, p, m) {
  return req === 'wx-server-sdk' ? wxServerSdk : origLoad.call(this, req, p, m)
}

const rank = require(RANK_FN)
const follow = require(FOLLOW_FN)
const klass = require(CLASS_FN)

let fails = 0
const assert = (c, m) => {
  if (!c) {
    console.error('❌ ' + m)
    fails++
  } else console.log('✓ ' + m)
}

;(async () => {
  // ---------- follow ----------
  const s = await follow.main({ action: 'search', nickName: 'A' })
  assert(s.list.some((u) => u.openid === 'a') && !s.list.some((u) => u.openid === OPENID), 'search "A" 命中 a 且排除自己')

  const f1 = await follow.main({ action: 'follow', targetOpenid: 'a' })
  assert(f1.ok && f1.isNew, 'follow a → isNew')
  const fl = await follow.main({ action: 'list' })
  assert(fl.list.some((u) => u.openid === 'a'), 'list 含好友 a')

  const f2 = await follow.main({ action: 'follow', targetOpenid: 'a' })
  assert(f2.ok && f2.already, '重复 follow → already（幂等）')

  // rank friends 过滤现在真实生效
  const rf = await rank.main({ action: 'getRank', scope: 'total', friends: true })
  assert(rf.friendOnly === true && rf.board.length === 1 && rf.board[0].openid === 'a', 'rank friends=true → 仅好友 a（friendOnly=true）')

  await follow.main({ action: 'unfollow', targetOpenid: 'a' })
  const fl2 = await follow.main({ action: 'list' })
  assert(!fl2.list.some((u) => u.openid === 'a'), 'unfollow 后 list 不含 a')
  const rf2 = await rank.main({ action: 'getRank', scope: 'total', friends: true })
  assert(rf2.friendOnly === false && rf2.board.length === 3, '无好友 → 回退全量 3 人')

  // ---------- class ----------
  const my = await klass.main({ action: 'my' })
  assert(my.list.some((c) => c.classId === 'classX'), 'my 含预置班级 classX')
  const bd = await klass.main({ action: 'board', classId: 'classX' })
  assert(
    JSON.stringify(bd.board.map((u) => u.openid)) === JSON.stringify(['a', OPENID, 'b']),
    '班级榜按 exp 排序 a,me,b'
  )
  const mb = await klass.main({ action: 'members', classId: 'classX' })
  assert(mb.members.length === 3, '班级成员 3 人')

  const crt = await klass.main({ action: 'create', name: '新班', goalText: '每日10词' })
  assert(crt.ok && crt.classId, 'create 班级成功')
  const my2 = await klass.main({ action: 'my' })
  assert(my2.list.length === 2, 'my 现在 2 个班级')
  const qt = await klass.main({ action: 'quit', classId: crt.classId })
  assert(qt.ok && qt.dissolved, 'owner 退出仅 1 人班级 → 解散')

  // ---------- rank classId ----------
  const rc = await rank.main({ action: 'getRank', scope: 'total', classId: 'classX' })
  assert(
    rc.classOnly === true && rc.board.length === 3 && rc.board[0].openid === 'a',
    'rank classId=classX → 仅班级成员，classOnly=true'
  )

  console.log(fails === 0 ? '\n✅ M3.2 follow/class/rank(扩展) 契约联调通过' : '\n❌ ' + fails + ' 项失败')
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => {
  console.error('❌ 异常', e)
  process.exit(1)
})
