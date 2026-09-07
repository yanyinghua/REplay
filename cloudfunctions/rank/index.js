// cloudfunctions/rank/index.js —— 排行榜云函数（action 派发）
// 说明：M3.1 排行榜。读取云端 users 聚合出榜单；sync 为最小化的「本地→云合并」
// （幂等取 max），使排行榜有真实数据。完整 syncProfile + 关卡实时上云留待 M3.0 统一。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (e) => {
  const { OPENID } = cloud.getWXContext();
  const action = e.action;
  if (action === 'getRank') return getRank(e, OPENID);
  if (action === 'sync') return sync(e, OPENID);
  return { error: 'unknown action: ' + action };
};

// 取排序字段与单位
function fieldOf(scope, bookId) {
  if (scope === 'streak') return { field: 'streak', unit: '天' };
  if (scope === 'learned') return { field: 'learnedTotal', unit: '词' };
  if (scope === 'book') return { field: `bookProgress.${bookId}.stars`, unit: '⭐' };
  return { field: 'exp', unit: '经验' };
}

// 从用户文档取某 scope 的数值
function valueOf(user, scope, bookId, field) {
  if (scope === 'book') {
    const bp = user.bookProgress && user.bookProgress[bookId];
    return (bp && bp.stars) || 0;
  }
  return user[field] || 0;
}

// 获取榜单 + 我的排名
async function getRank(e, OPENID) {
  const { scope = 'total', bookId = 'daily', friends = false, classId = '', limit = 50 } = e;
  const { field, unit } = fieldOf(scope, bookId);
  const users = db.collection('users');

  // 过滤维度：classId 优先；否则 friends（读取失败回退全量）
  let friendOnly = false;
  let classOnly = false;
  let openids = null;
  if (classId) {
    try {
      const c = await db.collection('classes').doc(classId).get();
      const cls = c.data;
      openids = cls && cls.members ? cls.members.slice() : [];
      classOnly = openids.length > 0;
    } catch {
      classOnly = false; // classes 集合尚未建立，回退全量
    }
  } else if (friends) {
    try {
      const f = await db
        .collection('friends')
        .where(_.or([{ _openid: OPENID }, { friendOpenid: OPENID }]))
        .limit(200)
        .get();
      const set = new Set();
      (f.data || []).forEach((r) => {
        set.add(r._openid);
        set.add(r.friendOpenid);
      });
      set.delete(OPENID);
      openids = Array.from(set);
      friendOnly = openids.length > 0;
    } catch {
      friendOnly = false; // friends 集合尚未建立，回退全量
    }
  }

  let query = users.orderBy(field, 'desc');
  if (openids && openids.length) query = query.where({ _openid: _.in(openids) });
  const list = await query.limit(limit).get();

  const board = (list.data || []).map((u, i) => ({
    rank: i + 1,
    openid: u._openid,
    nickName: u.nickName || '微信用户',
    avatar: u.avatar || '',
    value: valueOf(u, scope, bookId, field),
  }));

  // 我的排名：比我数值更高的人数 + 1
  const meDoc = await users.where({ _openid: OPENID }).get();
  const me = meDoc.data && meDoc.data[0];
  const myValue = me ? valueOf(me, scope, bookId, field) : 0;
  let higher = 0;
  if (myValue != null) {
    const c = await users.where({ [field]: _.gt(myValue) }).count();
    higher = c.total;
  }
  const myRank = higher + 1;

  return {
    board,
    me: {
      rank: myRank,
      value: myValue,
      openid: OPENID,
      inBoard: (list.data || []).some((u) => u._openid === OPENID),
    },
    friendOnly,
    classOnly,
    classId,
    scope,
    bookId,
    unit,
  };
}

// 最小化本地→云合并（取较大值，幂等）。M3.0 将统一为 syncProfile 并在关卡结算实时写云。
async function sync(e, OPENID) {
  const { exp = 0, coin = 0, streak = 0, level = 1, learnedTotal = 0, bookProgress = {} } = e;
  const users = db.collection('users');
  const u = await users.where({ _openid: OPENID }).get();
  const cur = u.data && u.data[0];
  if (!cur) return { ok: true, skipped: true };

  const patch = {
    exp: Math.max(cur.exp || 0, exp),
    coin: Math.max(cur.coin || 0, coin),
    streak: Math.max(cur.streak || 0, streak),
    level: Math.max(cur.level || 1, level),
    learnedTotal: Math.max(cur.learnedTotal || 0, learnedTotal),
  };

  // 词库进度：stars / learned 各取较大值
  const bp = Object.assign({}, cur.bookProgress || {});
  for (const bk of Object.keys(bookProgress || {})) {
    const curB = bp[bk] || {};
    const newB = bookProgress[bk] || {};
    bp[bk] = {
      stars: Math.max(curB.stars || 0, newB.stars || 0),
      learned: Math.max(curB.learned || 0, newB.learned || 0),
    };
  }
  patch.bookProgress = bp;

  await users.where({ _openid: OPENID }).update({ data: patch });
  return { ok: true };
}
