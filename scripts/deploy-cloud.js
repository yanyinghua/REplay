// scripts/deploy-cloud.js —— 用 miniprogram-ci 上传云函数（login + pk）
// 配置优先级：环境变量 > ci.config.json（请勿提交含密钥的文件）
//
// 用法：
//   npm run deploy:cloud
// 或环境变量：
//   WX_APPID=wx... WX_ENV=xxx WX_PRIVATE_KEY_PATH=./private.key npm run deploy:cloud
//
// 首次需：MP 后台「开发设置 → 开发者工具密钥 / 上传密钥」下载 .key 文件
// 说明：remoteNpmInstall=true 时云端安装依赖，不会上传本地 node_modules，
//       因此 cloudfunctions/* 目录无需先 npm install。

const ci = require('miniprogram-ci')
const path = require('path')

let local = {}
try { local = require('../ci.config.json') } catch (e) { /* 没有本地配置则用环境变量 */ }

const appid = process.env.WX_APPID || local.appid
const env = process.env.WX_ENV || local.env
const privateKeyPath = process.env.WX_PRIVATE_KEY_PATH || local.privateKeyPath

if (!appid || !env || !privateKeyPath) {
  console.error('缺少配置：请通过环境变量(WX_APPID/WX_ENV/WX_PRIVATE_KEY_PATH) 或 ci.config.json 提供 appid、env、privateKeyPath')
  process.exit(1)
}

const projectRoot = path.join(__dirname, '..')
const functions = [
  { name: 'login', dir: 'login' },
  { name: 'pk', dir: 'pk' },
  { name: 'rank', dir: 'rank' },
  { name: 'follow', dir: 'follow' },
  { name: 'class', dir: 'class' }
]

const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath: projectRoot,
  privateKeyPath,
  ignores: ['node_modules/**/*', 'scripts/**/*']
})

;(async () => {
  let ok = 0
  for (const fn of functions) {
    const fnPath = path.join(projectRoot, 'cloudfunctions', fn.dir)
    try {
      const res = await ci.cloud.uploadFunction({
        project,
        env,
        name: fn.name,
        path: fnPath,
        remoteNpmInstall: true
      })
      console.log(`✅ 部署成功 [${fn.name}]：files=${res.filesCount} size=${res.packSize}`)
      ok++
    } catch (err) {
      console.error(`❌ 部署失败 [${fn.name}]：`, err && err.message ? err.message : err)
      process.exitCode = 1
    }
  }
  console.log(`\n完成：${ok}/${functions.length} 个云函数部署成功`)
  if (ok < functions.length) process.exit(1)
})()
