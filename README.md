# ReadEnglish · 英语单词记忆小程序（M1 原型）

基于微信小程序 + 微信云开发。M1 已实现**单人记忆闭环**：选词库 → 翻转卡学习(趣味联想/双重编码) → 主动回忆闯关测验 → SRS 间隔复习 → 积分/等级/打卡/关卡星星。

## 运行方式
1. 用**微信开发者工具**打开本项目根目录（`project.config.json` 所在目录）。
2. 填入你的 `appid`（替换 `project.config.json` 中的 `touristappid`）。
3. 云能力（排行榜/PK）暂未启用，M1 全部用**本地存储**跑通，无需部署云函数即可预览。
4. 想要启用云开发（M3 社交）：在 `miniprogram/app.js` 把 `env: 'your-env-id'` 改成你的云环境 ID，并在 `cloudfunctions/login` 右键「上传并部署」。

## 目录结构
```
miniprogram/
  app.js / app.json / app.wxss      全局配置与样式
  data/words.js                     内置示例词库（2 本，50 词，emoji 占位插画）
  utils/
    srs.js                         SM-2 间隔重复算法
    store.js                       本地存储封装（SRS/积分/关卡进度）
  pages/
    launch   启动页
    home     首页（打卡/复习入口/记忆留存）
    books    词库选择
    study    翻转卡学习（联想+词根+发音）
    quiz     主动回忆测验（新词闯关 & 到期复习共用）
    review   复习入口
    map      关卡地图（星星进度）
    mine     我的（等级/徽章/清空）
cloudfunctions/login/              静默登录云函数（M3 用）
DESIGN.md                          完整设计方案（记忆科学→功能映射等）
```

## 下一步（见 DESIGN.md §10 路线图）
- M2 成长系统打磨、错词本
- M3 好友榜 / 实时 PK / 班级（接云开发）
- M4 词库扩充、UGC 联想、真实 TTS 发音与插画
