// cloudfunctions/class/index.js —— 班级/群云函数（action 派发）
// 说明：自建班级。classId 用 db.add 返回的 _id。成员存 members:[_openid]。
// board 复用 rank 思路：取成员 openid 过滤 users 按 exp 降序。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { OPENID } = cloud.getWXContext();

exports.main = async (e) => {
  const action = e.action;
  if (action === 'create') return create(e);
  if (action === 'join') return join(e);
  if (action === 'quit') return quit(e);
  if (action === 'my') return my();
  if (action === 'members') return members(e);
  if (action === 'board') return board(e);
  return { error: 'unknown action: ' + action };
};

// 建班：owner=本人，members=[本人]
async function create(e) {
  const name = (e.name || '').trim();
  if (!name) return { error: '班级名不能为空' };
  const doc = {
    name,
    owner: OPENID,
    members: [OPENID],
    goalText: (e.goalText || '').trim(),
    createAt: Date.now(),
  };
  const res = await db.collection('classes').add({ data: doc });
  return { ok: true, classId: res._id, class: Object.assign({ _id: res._id }, doc) };
}

// 加入：members push 去重
async function join(e) {
  const classId = e.classId;
  if (!classId) return { error: '缺少 classId' };
  const classes = db.collection('classes');
  const c = await classes.doc(classId).get();
  const cls = c.data;
  if (!cls) return { error: '班级不存在' };
  if ((cls.members || []).includes(OPENID)) return { ok: true, already: true };
  await classes.doc(classId).update({ data: { members: _.push(OPENID) } });
  return { ok: true, joined: true };
}

// 退出：非 owner 直接 pull；owner 退出则转让首位成员，无成员则解散
async function quit(e) {
  const classId = e.classId;
  if (!classId) return { error: '缺少 classId' };
  const classes = db.collection('classes');
  const c = await classes.doc(classId).get();
  const cls = c.data;
  if (!cls) return { error: '班级不存在' };
  if (!(cls.members || []).includes(OPENID)) return { ok: true, notMember: true };
  if (cls.owner === OPENID) {
    const rest = (cls.members || []).filter((m) => m !== OPENID);
    if (rest.length === 0) {
      await classes.doc(classId).remove();
      return { ok: true, dissolved: true };
    }
    await classes.doc(classId).update({ data: { owner: rest[0], members: rest } });
    return { ok: true, transferredTo: rest[0] };
  }
  await classes.doc(classId).update({ data: { members: _.pull(OPENID) } });
  return { ok: true, quit: true };
}

// 我的班级列表
async function my() {
  const res = await db
    .collection('classes')
    .where({ members: OPENID })
    .field({ _id: true, name: true, owner: true, goalText: true, members: true })
    .limit(50)
    .get();
  return {
    list: (res.data || []).map((c) => ({
      classId: c._id,
      name: c.name,
      owner: c.owner,
      goalText: c.goalText || '',
      memberCount: (c.members || []).length,
      isOwner: c.owner === OPENID,
    })),
  };
}

// 班级成员
async function members(e) {
  const classId = e.classId;
  if (!classId) return { error: '缺少 classId' };
  const c = await db.collection('classes').doc(classId).get();
  const cls = c.data;
  if (!cls) return { error: '班级不存在' };
  const res = await db
    .collection('users')
    .where({ _openid: _.in(cls.members || []) })
    .field({ _openid: true, nickName: true, avatar: true, exp: true, level: true })
    .limit(200)
    .get();
  return {
    classId,
    name: cls.name,
    owner: cls.owner,
    members: (res.data || []).map((u) => ({
      openid: u._openid,
      nickName: u.nickName || '微信用户',
      avatar: u.avatar || '',
      exp: u.exp || 0,
      level: u.level || 1,
    })),
  };
}

// 班级榜：成员按 exp 降序
async function board(e) {
  const classId = e.classId;
  if (!classId) return { error: '缺少 classId' };
  const c = await db.collection('classes').doc(classId).get();
  const cls = c.data;
  if (!cls) return { error: '班级不存在' };
  const ids = cls.members || [];
  if (!ids.length) return { board: [], classId };
  const res = await db
    .collection('users')
    .where({ _openid: _.in(ids) })
    .field({ _openid: true, nickName: true, avatar: true, exp: true, level: true })
    .orderBy('exp', 'desc')
    .limit(100)
    .get();
  const board = (res.data || []).map((u, i) => ({
    rank: i + 1,
    openid: u._openid,
    nickName: u.nickName || '微信用户',
    avatar: u.avatar || '',
    exp: u.exp || 0,
    level: u.level || 1,
  }));
  return { board, classId, name: cls.name };
}
