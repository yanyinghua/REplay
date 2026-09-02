// utils/auth.js —— 登录状态管理（微信 openid 静默登录）
const LOGIN_KEY = 'login_state'

function isLoggedIn() {
  try { return !!wx.getStorageSync(LOGIN_KEY) } catch (e) { return false }
}

// 登录成功：写入本地标记 + 更新全局 openid
function markLoggedIn(openid) {
  try { wx.setStorageSync(LOGIN_KEY, { openid, at: Date.now() }) } catch (e) {}
  try { getApp().globalData.openid = openid } catch (e) {}
}

module.exports = { isLoggedIn, markLoggedIn }
