// cloudfunctions/pk/pkLogic.js —— PK 抢答/超时的纯状态机（无云依赖，可独立测试）
// 与 M3_PK_DETAIL.md §C 一致：服务端权威、qIndex 匹配防过期/双计、事务串行
const T = 8000; // 每轮限时(ms)
const BASE = 10; // 基础分
const SPEED_MAX = 5; // 速度奖励上限

function resetPlayers(room) {
  room.players.forEach((p) => {
    p.locked = false;
    p.answers = null;
  });
}

function higherScorer(players) {
  const [a, b] = players;
  if (!a || !b) return null;
  if (a.score === b.score) return null;
  return a.score > b.score ? a._openid : b._openid;
}

// 提交答案。room 会被原地修改；返回 {ok, result} 或 {ok:false, late, reason}
function applyAnswer(room, openid, qIndex, optionIndex, corrects, now) {
  if (room.status !== 'playing') return { ok: false, reason: 'not playing' };
  if (qIndex !== room.qIndex) return { ok: false, late: true, reason: 'round advanced' };
  if (now - room.roundStart > T) return { ok: false, late: true, reason: 'expired' };

  const me = room.players.find((p) => p._openid === openid);
  if (!me) return { ok: false, reason: 'not a player' };
  if (me.answers && me.answers.qIndex === room.qIndex)
    return { ok: false, late: true, reason: 'already answered' };
  if (me.locked) return { ok: false, late: true, reason: 'locked' };

  const correctIdx = corrects[room.qIndex];
  const isCorrect = optionIndex === correctIdx;

  if (isCorrect) {
    const elapsed = now - room.roundStart;
    const pts = BASE + Math.max(0, Math.round(((T - elapsed) / T) * SPEED_MAX));
    me.score += pts;
    me.answers = { qIndex, correct: true, ts: now };
    me.locked = false;
    const next = room.qIndex + 1;
    if (next >= room.questionPool.length) {
      room.status = 'finished';
      room.winner = openid;
      room.lastRound = { winner: openid, type: 'correct' };
    } else {
      room.qIndex = next;
      room.roundStart = now;
      room.lastRound = { winner: openid, type: 'correct' };
      resetPlayers(room); // 新一轮双方解锁
    }
    return {
      ok: true,
      result: {
        correct: true,
        pts,
        qIndex: room.qIndex,
        finished: room.status === 'finished',
        winner: room.winner,
      },
    };
  } else {
    me.answers = { qIndex, correct: false, ts: now };
    me.locked = true; // 本轮锁定，对手仍可抢
    return { ok: true, result: { correct: false, locked: true, qIndex: room.qIndex } };
  }
}

// 超时推进。room 原地修改；返回 {ok, result} 或 {ok:false, late, reason}
function applyTimeout(room, now) {
  if (room.status !== 'playing') return { ok: false, reason: 'not playing' };
  if (now - room.roundStart <= T) return { ok: false, late: true, reason: 'not expired' };
  const next = room.qIndex + 1;
  if (next >= room.questionPool.length) {
    room.status = 'finished';
    room.winner = higherScorer(room.players);
    room.lastRound = { winner: room.winner, type: 'timeout' };
  } else {
    room.qIndex = next;
    room.roundStart = now;
    room.lastRound = { winner: null, type: 'timeout' };
    resetPlayers(room);
  }
  return {
    ok: true,
    result: { qIndex: room.qIndex, finished: room.status === 'finished', winner: room.winner },
  };
}

module.exports = { applyAnswer, applyTimeout, resetPlayers, higherScorer, T, BASE, SPEED_MAX };
