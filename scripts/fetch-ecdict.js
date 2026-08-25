// scripts/fetch-ecdict.js —— 下载 ECDICT 开源英汉词典数据库（约 70 万词条，62MB）
// 数据源：https://github.com/skywind3000/ECDICT （MIT 协议，免费）
// 用法：node scripts/fetch-ecdict.js
// 输出：scripts/cache/ecdict.csv
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const SOURCES = [
  'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv',
  'https://cdn.jsdelivr.net/gh/skywind3000/ECDICT@master/ecdict.csv',
  'https://github.com/skywind3000/ECDICT/raw/master/ecdict.csv'
]
const OUT = path.join(__dirname, 'cache', 'ecdict.csv')

function download(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(download(res.headers.location))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks = []
      let size = 0
      res.on('data', c => { chunks.push(c); size += c.length })
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        if (buf.length < 1000000) return reject(new Error(`下载不完整(${buf.length}B)`))
        resolve(buf)
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(new Error('超时')) })
  })
}

async function main() {
  for (const src of SOURCES) {
    try {
      console.log(`尝试下载：${src}`)
      const buf = await download(src)
      fs.writeFileSync(OUT, buf)
      const lines = buf.toString('utf8').split('\n').length - 1
      console.log(`✅ 下载成功：${(buf.length / 1024 / 1024).toFixed(1)} MB，${lines} 词条 → ${OUT}`)
      return
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
    }
  }
  console.log('所有下载源均失败，请检查网络后重试')
  process.exit(1)
}

main()
