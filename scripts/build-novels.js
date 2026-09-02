// scripts/build-novels.js —— 把双语书目导出为云数据库导入文件
// 输出（每行一条 JSON，可直接在云开发控制台导入）：
//   scripts/out/novels.json           → novels 集合（书目元数据，导入模式选 Upsert）
//   scripts/out/novel_chapters.json   → novel_chapters 集合（章节双语正文）
// 使用：node scripts/build-novels.js
// 说明：
//   · 导入后客户端会自动拉取书目；云端 version > 内置样书 version 时出现「下载/更新」。
//   · 新增名著：在 miniprogram/data/novels.js 的 SAMPLE_NOVELS 里加一本（或仿照本脚本
//     自定义输出 novels.json / novel_chapters.json），version 递增即可触发自动更新。
const fs = require('fs')
const path = require('path')

const { SAMPLE_NOVELS } = require('../miniprogram/data/novels.js')

function main() {
  const novels = []
  const chapters = []
  const updatedAt = Date.now()
  ;(SAMPLE_NOVELS || []).forEach(b => {
    const m = b.meta
    const version = m.version || 1
    novels.push({
      _id: m.novelId,
      novelId: m.novelId,
      title: m.title,
      enTitle: m.enTitle || '',
      author: m.author || '',
      desc: m.desc || '',
      emoji: m.emoji || '📕',
      color: m.color || '#4f6ef7',
      wordCount: m.wordCount || 0,
      chapterCount: (b.chapters || []).length,
      version,
      updatedAt
    })
    ;(b.chapters || []).forEach(ch => {
      chapters.push({
        _id: `${m.novelId}-${ch.seq}`,
        novelId: m.novelId,
        seq: ch.seq,
        title: ch.title || `Chapter ${ch.seq + 1}`,
        segments: ch.segments || [],
        version
      })
    })
  })
  const outDir = path.join(__dirname, 'out')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'novels.json'), novels.map(x => JSON.stringify(x)).join('\n'))
  fs.writeFileSync(path.join(outDir, 'novel_chapters.json'), chapters.map(x => JSON.stringify(x)).join('\n'))
  console.log(`已生成 ${novels.length} 本书 / ${chapters.length} 章：`)
  console.log('  - scripts/out/novels.json          → 导入 novels 集合')
  console.log('  - scripts/out/novel_chapters.json  → 导入 novel_chapters 集合')
}

main()
