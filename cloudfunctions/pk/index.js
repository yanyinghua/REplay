// cloudfunctions/pk/index.js —— 实时 PK 云函数（action 派发）
// 说明：为部署简单，match/start/answer/timeout 合并到单个函数按 action 分发。
// 核心防作弊：答案(correct)只存 pk_secrets，客户端只读 questionPool.display；
// answer/timeout 在数据库事务中执行纯状态机(pkLogic)，保证并发串行、不双计/双推进。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { OPENID } = cloud.getWXContext();

const { newRoom, defaultPlayer } = require('./pkRoom.js');
const { buildPool } = require('./questionPool.js');
const { applyAnswer, applyTimeout } = require('./pkLogic.js');

exports.main = async (e) => {
  const action = e.action;
  if (action === 'match') return match(e);
  if (action === 'start') return start(e);
  if (action === 'answer') return answer(e);
  if (action === 'timeout') return timeout(e);
  if (action === 'heartbeat') return heartbeat(e);
  if (action === 'quit') return quit(e);
  if (action === 'result') return result(e);
  return { error: 'unknown action: ' + action };
};

// 匹配：加入现有 waiting 房或新建；支持指定 roomId（邀请）
async function match(e) {
  const { bookId = 'daily', level = 0, roomId } = e;
  const rooms = db.collection('pk_rooms');

  if (roomId) {
    const r = await rooms.doc(roomId).get();
    if (r.data && r.data.status === 'waiting' && r.data.players.length < 2) {
      const players = r.data.players.concat([defaultPlayer(OPENID)]);
      await rooms.doc(roomId).update({ data: { players, updatedAt: Date.now() } });
      return { roomId, joined: true, players };
    }
    return { error: 'room unavailable' };
  }

  const list = await rooms.where({ status: 'waiting', bookId, level }).limit(10).get();
  const cand = (list.data || []).find((r) => r.players.length < 2);
  if (cand) {
    const players = cand.players.concat([defaultPlayer(OPENID)]);
    await rooms.doc(cand._id).update({ data: { players, updatedAt: Date.now() } });
    return { roomId: cand._id, joined: true, players };
  }

  const room = newRoom(null, bookId, level, OPENID);
  const res = await rooms.add({ data: room });
  return { roomId: res._id, created: true };
}

// 开局：生成题池，correct 拆到 pk_secrets，room 只留 display
async function start(e) {
  const { roomId, allowSolo } = e;
  const rooms = db.collection('pk_rooms');
  const r = await rooms.doc(roomId).get();
  const room = r.data;
  if (!room) return { error: 'no room' };
  if (room.players.length < 2 && !allowSolo) return { error: 'need 2 players' };

  const pool = buildPool(room.bookId, room.level, room.count || 12);
  const questionPool = pool.map((q) => ({ wordId: q.wordId, display: q.display })); // 不下发 correct
  const corrects = pool.map((q) => q.correct);

  await rooms.doc(roomId).update({
    data: {
      questionPool,
      status: 'playing',
      qIndex: 0,
      roundStart: Date.now(),
      roundResolved: false,
      lastRound: null,
      answers: {},
      updatedAt: Date.now(),
    },
  });

  const secrets = db.collection('pk_secrets');
  const exist = await secrets.doc(roomId).get();
  if (exist.data) {
    await secrets.doc(roomId).update({ data: { corrects, updatedAt: Date.now() } });
  } else {
    await secrets.add({ data: { _id: roomId, roomId, corrects, createdAt: Date.now() } });
  }

  return { ok: true, qIndex: 0, count: pool.length, questions: questionPool };
}

// 提交答案：事务中执行纯状态机
async function answer(e) {
  const { roomId } = e;
  const qIndex = Number(e.qIndex);
  const optionIndex = Number(e.optionIndex);
  if (roomId === undefined || isNaN(qIndex) || isNaN(optionIndex)) {
    return { error: 'missing roomId/qIndex/optionIndex' };
  }
  const sec = await db.collection('pk_secrets').doc(roomId).get();
  const corrects = sec.data ? sec.data.corrects : null;
  if (!corrects) return { error: 'no secrets' };

  const tx = await db.startTransaction();
  try {
    const res = await tx.collection('pk_rooms').doc(roomId).get();
    const room = res.data;
    if (!room) {
      await tx.rollback();
      return { error: 'no room' };
    }
    const now = Date.now();
    const r = applyAnswer(room, OPENID, qIndex, optionIndex, corrects, now);
    if (!r.ok) {
      await tx.rollback();
      return { late: r.late, reason: r.reason };
    }
    await tx
      .collection('pk_rooms')
      .doc(roomId)
      .update({
        data: {
          players: room.players,
          qIndex: room.qIndex,
          status: room.status,
          roundStart: room.roundStart,
          lastRound: room.lastRound,
          winner: room.winner,
          updatedAt: now,
        },
      });
    await tx.commit();
    return Object.assign({ ok: true }, r.result);
  } catch (err) {
    await tx.rollback();
    return { error: 'tx failed: ' + (err && err.message) };
  }
}

// 超时推进：事务中执行纯状态机
async function timeout(e) {
  const { roomId } = e;
  if (roomId === undefined) return { error: 'missing roomId' };
  const tx = await db.startTransaction();
  try {
    const res = await tx.collection('pk_rooms').doc(roomId).get();
    const room = res.data;
    if (!room) {
      await tx.rollback();
      return { error: 'no room' };
    }
    const now = Date.now();
    const r = applyTimeout(room, now);
    if (!r.ok) {
      await tx.rollback();
      return { late: r.late, reason: r.reason };
    }
    await tx
      .collection('pk_rooms')
      .doc(roomId)
      .update({
        data: {
          players: room.players,
          qIndex: room.qIndex,
          status: room.status,
          roundStart: room.roundStart,
          lastRound: room.lastRound,
          winner: room.winner,
          updatedAt: now,
        },
      });
    await tx.commit();
    return Object.assign({ ok: true }, r.result);
  } catch (err) {
    await tx.rollback();
    return { error: 'tx failed: ' + (err && err.message) };
  }
}

// 结算奖励：胜/负/平 发放 EXP/金币，记录连胜与「十连胜」徽章，写入 users（幂等）
function rewardFor(isWin, isDraw) {
  if (isDraw) return { exp: 15, coin: 5, win: false };
  if (isWin) return { exp: 30, coin: 15, win: true };
  return { exp: 10, coin: 5, win: false };
}

// 结算（自然结束 / 退出均复用）：写奖励到 users，幂等
async function settleRoom(room) {
  const rooms = db.collection('pk_rooms');
  if (room.result) return { ok: true, already: true, result: room.result };
  const settle = await rooms.where({ _id: room._id, settled: _.neq(true) }).update({
    data: { settled: true, status: 'finished', winner: room.winner },
  });
  if (!settle.stats || settle.stats.updated === 0) {
    const rr = await rooms.doc(room._id).get();
    return { ok: true, already: true, result: rr.data.result };
  }
  const players = room.players || [];
  const rewards = {};
  players.forEach((p) => {
    rewards[p._openid] = rewardFor(room.winner === p._openid, !room.winner);
  });
  const newBadges = {};
  for (const p of players) {
    const rw = rewards[p._openid];
    const u = await db.collection('users').where({ _openid: p._openid }).get();
    const ud = u.data && u.data[0];
    const prevStreak = ud ? ud.pkStreak || 0 : 0;
    const ns = rw.win ? prevStreak + 1 : 0;
    const badges = ud && ud.badges ? ud.badges.slice() : [];
    let nb = [];
    if (rw.win && ns >= 10 && badges.indexOf('pk10') < 0) {
      badges.push('pk10');
      nb = ['pk10'];
    }
    await db
      .collection('users')
      .where({ _openid: p._openid })
      .update({
        data: {
          exp: _.inc(rw.exp),
          coin: _.inc(rw.coin),
          pkStreak: ns,
          pkWins: _.inc(rw.win ? 1 : 0),
          badges,
        },
      });
    newBadges[p._openid] = nb;
  }
  const payload = { winner: room.winner, rewards, newBadges };
  await rooms.doc(room._id).update({ data: { result: payload } });
  // TODO: 触发 rankAgg 刷新排行榜（M3.1）；users.exp 已更新，榜会随之变化
  return { ok: true, result: payload };
}

async function result(e) {
  const { roomId } = e;
  if (roomId === undefined) return { error: 'missing roomId' };
  const r = await db.collection('pk_rooms').doc(roomId).get();
  const room = r.data;
  if (!room) return { error: 'no room' };
  if (room.status !== 'finished') return { error: 'not finished' };
  return settleRoom(room);
}

// 心跳：更新本人 lastSeen（存 heartbeats[openid]，避免覆盖 players 数组）
async function heartbeat(e) {
  const { roomId } = e;
  if (roomId === undefined) return { error: 'missing roomId' };
  const rooms = db.collection('pk_rooms');
  const r = await rooms.doc(roomId).get();
  const room = r.data;
  if (!room) return { error: 'no room' };
  if (room.status !== 'playing') return { ok: true, ignored: true };
  const d = {};
  d['heartbeats.' + OPENID] = Date.now();
  await rooms.doc(roomId).update({ data: d });
  return { ok: true };
}

// 退出/断线：本人弃权，对手获胜并结算（幂等）
async function quit(e) {
  const { roomId } = e;
  if (roomId === undefined) return { error: 'missing roomId' };
  const rooms = db.collection('pk_rooms');
  const r = await rooms.doc(roomId).get();
  const room = r.data;
  if (!room) return { error: 'no room' };
  if (room.status === 'waiting') {
    if ((room.players || []).length <= 1)
      await rooms.doc(roomId).update({ data: { status: 'closed' } });
    return { ok: true };
  }
  if (room.status !== 'playing') return { ok: true, already: true, result: room.result };
  const opp = (room.players.find((p) => p._openid !== OPENID) || {})._openid;
  room.winner = opp || null;
  return settleRoom(room);
}
