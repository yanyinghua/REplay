// cloudfunctions/login/index.js
// 静默登录：返回 openid，首次自动建用户档案（M3 社交/排行榜/PK 使用）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const users = db.collection('users');
  const user = await users.where({ _openid: OPENID }).get();
  if (!user.data || user.data.length === 0) {
    const doc = {
      _openid: OPENID,
      nickName: '微信用户',
      avatar: '',
      exp: 0,
      level: 1,
      coin: 0,
      streak: 0,
      lastCheckin: 0,
      badges: [],
      learnedTotal: 0,
      bookProgress: {},
      createdAt: Date.now(),
    };
    await users.add({ data: doc });
    return { openid: OPENID, user: doc, created: true };
  }
  return { openid: OPENID, user: user.data[0], created: false };
};
