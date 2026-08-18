// cloudfunctions/pk/pkRoom.js —— pk_rooms 字段结构（集中定义，避免散落）
// 字段以 M3_PK_DETAIL.md §A.2/§B 为准
// 注意：questionPool 仅含 display（无 correct），correct 存在独立 pk_secrets

function defaultPlayer(openid) {
  return {
    _openid: openid,
    nickName: '',
    avatar: '',
    score: 0,
    locked: false, // 本轮是否答错锁定
    ready: false,
    answers: null, // 本轮作答记录 {qIndex, correct, ts}
    lastSeen: Date.now(),
  };
}

function newRoom(roomId, bookId, level, openid) {
  return {
    _id: roomId || undefined, // 新建时交由云数据库生成
    status: 'waiting', // waiting | playing | finished
    mode: 'level',
    bookId: bookId || 'daily',
    level: level || 0,
    count: 12, // 题量
    players: [defaultPlayer(openid)],
    questionPool: [], // 仅 display，无 correct
    qIndex: 0,
    roundStart: 0,
    roundResolved: false,
    lastRound: null, // {winner, type:'correct'|'timeout'|null}
    answers: {}, // {[openid]: {qIndex, correct, ts}}
    winner: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

module.exports = { newRoom, defaultPlayer };
