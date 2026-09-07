// cloudfunctions/follow/index.js —— 好友关系云函数（action 派发）
// 说明：微信标准小程序无好友列表 API，好友走「自建关注」。关注即双向互关
// （friends 集合写 A→B 与 B→A 两条），取关删两条。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (e) => {
  const { OPENID } = cloud.getWXContext();
  const action = e.action;
  if (action === 'search') return search(e, OPENID);
  if (action === 'follow') return follow(e, OPENID);
  if (action === 'unfollow') return unfollow(e, OPENID);
  if (action === 'list') return list(OPENID);
  return { error: 'unknown action: ' + action };
};

// 昵称搜索（前缀匹配，排除自己），返回前 20 个
async function search(e, OPENID) {
  const kw = (e.nickName || '').trim();
  if (!kw) return { list: [] };
  const reg = db.RegExp({ regexp: '^' + escapeReg(kw), options: 'i' });
  const res = await db
    .collection('users')
    .where({ _openid: _.neq(OPENID), nickName: reg })
    .field({ _openid: true, nickName: true, avatar: true })
    .limit(20)
    .get();
  return {
    list: (res.data || []).map((u) => ({
      openid: u._openid,
      nickName: u.nickName,
      avatar: u.avatar || '',
    })),
  };
}

// 关注：写双向互关；已是好友则忽略（幂等）
async function follow(e, OPENID) {
  const target = e.targetOpenid;
  if (!target || target === OPENID) return { error: 'invalid target' };
  const friends = db.collection('friends');
  const exist = await friends
    .where(
      _.or([
        { _openid: OPENID, friendOpenid: target },
        { _openid: target, friendOpenid: OPENID },
      ])
    )
    .limit(1)
    .get();
  if (exist.data && exist.data.length) return { ok: true, already: true };
  const now = Date.now();
  await friends.add({ data: { _openid: OPENID, friendOpenid: target, createAt: now } });
  await friends.add({ data: { _openid: target, friendOpenid: OPENID, createAt: now } });
  return { ok: true, isNew: true };
}

// 取关：删双向
async function unfollow(e, OPENID) {
  const target = e.targetOpenid;
  if (!target) return { error: 'invalid target' };
  const friends = db.collection('friends');
  await friends.where({ _openid: OPENID, friendOpenid: target }).remove();
  await friends.where({ _openid: target, friendOpenid: OPENID }).remove();
  return { ok: true };
}

// 我的好友（互关）列表
async function list(OPENID) {
  const friends = db.collection('friends');
  const mine = await friends.where({ _openid: OPENID }).limit(200).get();
  const ids = (mine.data || []).map((r) => r.friendOpenid);
  if (!ids.length) return { list: [] };
  const res = await db
    .collection('users')
    .where({ _openid: _.in(ids) })
    .field({ _openid: true, nickName: true, avatar: true })
    .limit(200)
    .get();
  return {
    list: (res.data || []).map((u) => ({
      openid: u._openid,
      nickName: u.nickName,
      avatar: u.avatar || '',
    })),
  };
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
