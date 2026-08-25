// 云函数 import-words —— 导入词库到云数据库
// 调用方式（小程序端或 HTTP 触发）：
//   wx.cloud.callFunction({
//     name: 'import-words',
//     data: { book: { bookId, name, desc, emoji, color, version }, words: [{ id, spell, phonetic, emoji, meaning, example, root, mnemonic, tags }] }
//   })
// 幂等：重复导入会先删除旧词条再插入，元数据 upsert。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

exports.main = async (event) => {
  const { book, words } = event || {}
  if (!book || !book.bookId) return { error: '缺少 book.bookId' }
  const bookId = book.bookId
  const list = Array.isArray(words) ? words : []

  // 1. upsert 词库元数据
  const meta = {
    bookId,
    name: book.name || bookId,
    desc: book.desc || '',
    emoji: book.emoji || '📚',
    color: book.color || '#4f6ef7',
    wordCount: list.length,
    levelCount: Math.ceil(list.length / 10),
    source: book.source || 'cloud',
    version: book.version || 1,
    updatedAt: Date.now()
  }
  const exist = await db.collection('books').where({ bookId }).get()
  if (exist.data.length) {
    await db.collection('books').doc(exist.data[0]._id).update({ data: meta })
  } else {
    await db.collection('books').add({ data: meta })
  }

  // 2. 删除旧词条（幂等）
  await db.collection('words').where({ bookId }).remove()

  // 3. 分批插入（限速避免触发写入限流）
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH)
    await Promise.all(chunk.map(w => db.collection('words').add({
      data: {
        _id: `w_${bookId}_${w.id}`,
        bookId,
        id: w.id,
        spell: w.spell,
        phonetic: w.phonetic || '',
        emoji: w.emoji || '',
        meaning: w.meaning,
        example: w.example || '',
        root: w.root || '',
        mnemonic: w.mnemonic || '',
        tags: w.tags || [],
        createdAt: Date.now()
      }
    })))
    inserted += chunk.length
    await sleep(150)
  }

  return { ok: true, bookId, imported: inserted, wordCount: meta.wordCount }
}
