// 云函数 get-words —— 批量拉取词库词条（加速词库下载）
// 调用方式：
//   wx.cloud.callFunction({
//     name: 'get-words',
//     data: { bookId: 'mega1', skip: 0, limit: 1000 }
//   })
// 说明：
//   - limit 最大 1000（云函数端单次 get 上限）
//   - skip === 0 时额外返回 total（词库总数），便于客户端计算分页
// 返回：{ ok, bookId, list: [...], total, end }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_LIMIT = 1000

exports.main = async (event) => {
  const { bookId } = event || {}
  if (!bookId) return { error: '缺少 bookId' }

  const limit = Math.max(1, Math.min(parseInt(event.limit, 10) || MAX_LIMIT, MAX_LIMIT))
  const skip = Math.max(0, parseInt(event.skip, 10) || 0)
  const col = db.collection('words')

  // skip === 0 时顺带返回总数，省一次客户端 count 调用
  let total = 0
  if (skip === 0) {
    try { total = (await col.where({ bookId }).count()).total || 0 } catch (e) {}
  }

  const r = await col.where({ bookId }).skip(skip).limit(limit).get()
  const list = r.data || []
  return {
    ok: true,
    bookId,
    list,
    total,
    end: list.length < limit
  }
}
