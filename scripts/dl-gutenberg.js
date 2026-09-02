// scripts/dl-gutenberg.js —— 通用公版全文下载器
// 路径：直接 raw.githubusercontent 试猜测（快）→ 失败则 GitHub API 搜索 GITenberg 仓库（准）
// 用法：
//   node scripts/dl-gutenberg.js "<书名/搜索词>" <输出别名> [候选GutenbergId...]
//   例：node scripts/dl-gutenberg.js "The Wind in the Willows" wind-willows 289
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const title = process.argv[2]
const alias = process.argv[3]
if (!title || !alias) {
  console.error('用法: node scripts/dl-gutenberg.js "<书名>" <别名> [候选id...]')
  process.exit(1)
}
const candIds = process.argv.slice(4).filter(x => /^\d+$/.test(x))
const OUT = path.join(__dirname, 'cache', alias + '.txt')

const UA = { 'User-Agent': 'Mozilla/5.0 (study-script)' }
function httpGet(url, bin) {
  return new Promise((resolve, reject) => {
    const m = url.startsWith('https') ? https : http
    const req = m.get(url, { headers: UA }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); resolve(httpGet(res.headers.location, bin)); return
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(bin ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('timeout')))
  })
}

async function tryRaw(id) {
  const stems = [id, `${id}-0`, `pg${id}`]
  for (const repoName of [title.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).join('-') + '_' + id]) {
    for (const stem of stems) {
      for (const branch of ['master', 'main']) {
        const u = `https://raw.githubusercontent.com/GITenberg/${repoName}/${branch}/${stem}.txt`
        try {
          const buf = await httpGet(u, true)
          if (buf.length > 8000) { console.log('raw OK', u, buf.length); return buf }
        } catch (e) { /* next */ }
      }
    }
  }
  return null
}

async function findRepo() {
  const q = encodeURIComponent(`org:GITenberg in:name ${title.split(/\s+/).map(w => w.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean).slice(0, 4).join('-')}`)
  const r = JSON.parse(await httpGet(`https://api.github.com/search/repositories?q=${q}&per_page=10`))
  const items = (r.items || []).filter(x => /\d+$/.test(x.name))
  if (!items.length) { console.error('GitHub API 未找到仓库，查询:', q); return null }
  const repo = items[0]
  const branch = repo.default_branch || 'master'
  const contents = JSON.parse(await httpGet(`https://api.github.com/repos/${repo.full_name}/contents?ref=${branch}`))
  const arr = Array.isArray(contents) ? contents : []
  const txts = arr.filter(f => f.type === 'file' && /\.txt$/i.test(f.name) && !/-images/i.test(f.name))
  if (!txts.length) { console.error('仓库内无 txt', repo.full_name); return null }
  txts.sort((a, b) => (b.size || 0) - (a.size || 0))
  const pick = txts[0]
  const buf = await httpGet(`https://raw.githubusercontent.com/${repo.full_name}/${branch}/${pick.name}`, true)
  console.log('api OK', repo.full_name + '/' + pick.name, buf.length)
  return buf
}

async function main() {
  let buf = null
  for (const id of candIds) {
    buf = await tryRaw(id)
    if (buf) break
  }
  if (!buf) {
    console.warn('raw 猜测失败，改用 GitHub API…')
    buf = await findRepo()
  }
  if (!buf || buf.length < 10000) { console.error('下载失败'); process.exit(1) }
  fs.writeFileSync(OUT, buf)
  console.log('→ ' + OUT + '  (' + buf.length + ' bytes)')
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
