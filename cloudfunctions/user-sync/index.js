// cloudfunctions/user-sync/index.js —— 学习记录云端备份/恢复
// 数据模型（集合 usync，一条 doc = 一个数据分片，全部带 owner 便于按 openid 查询）：
//   - `${openid}:meta`               { owner, type:'meta', profile, progress, hand, updatedAt }
//   - `${openid}:srs:${b}`           { owner, type:'srs', bucket:b, map, updatedAt }   b = 0..3
//   - `${openid}:learned:${b}`       { owner, type:'learned', bucket:b, books, updatedAt }
// 说明：
//   - srs / learned 词条量大，按哈希拆 4 桶，规避单文档 512KB 限制
//   - 冲突策略在客户端：拉取合并后整包回传覆盖（幂等）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLL = 'usync';

async function pushMeta(openid, e) {
  const { profile = null, progress = null, hand = '', mybox = [], updatedAt = Date.now() } = e;
  await db.collection(COLL).doc(`${openid}:meta`).set({
    data: { owner: openid, type: 'meta', profile, progress, hand, mybox, updatedAt }
  });
  return { ok: true };
}

async function pushSrsBucket(openid, e) {
  const { bucket = 0, map = {}, updatedAt = Date.now() } = e;
  await db.collection(COLL).doc(`${openid}:srs:${bucket}`).set({
    data: { owner: openid, type: 'srs', bucket, map, updatedAt }
  });
  return { ok: true };
}

async function pushLearnedBucket(openid, e) {
  const { bucket = 0, books = {}, updatedAt = Date.now() } = e;
  await db.collection(COLL).doc(`${openid}:learned:${bucket}`).set({
    data: { owner: openid, type: 'learned', bucket, books, updatedAt }
  });
  return { ok: true };
}

async function pull(openid) {
  const out = { meta: null, srs: {}, learned: {} };
  const r = await db.collection(COLL).where({ owner: openid }).limit(20).get();
  (r.data || []).forEach((d) => {
    if (d.type === 'meta') {
      out.meta = {
        profile: d.profile || null,
        progress: d.progress || null,
        hand: d.hand || '',
        mybox: d.mybox || [],
        updatedAt: d.updatedAt || 0
      };
    } else if (d.type === 'srs' && d.map) {
      Object.keys(d.map).forEach((k) => { out.srs[k] = d.map[k]; });
    } else if (d.type === 'learned' && d.books) {
      Object.keys(d.books).forEach((bid) => { out.learned[bid] = d.books[bid]; });
    }
  });
  return { ok: true, meta: out.meta, srs: out.srs, learned: out.learned };
}

exports.main = async (e = {}) => {
  const { OPENID } = cloud.getWXContext();
  const action = e.action || '';
  if (!OPENID) return { error: 'no openid' };
  try {
    if (action === 'pushMeta') return await pushMeta(OPENID, e);
    if (action === 'pushSrs') return await pushSrsBucket(OPENID, e);
    if (action === 'pushLearned') return await pushLearnedBucket(OPENID, e);
    if (action === 'pull') return await pull(OPENID);
    return { error: 'unknown action: ' + action };
  } catch (err) {
    console.error('user-sync error:', action, err);
    return { error: err.message || 'sync error' };
  }
};
