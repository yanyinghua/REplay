# M3 规划：好友榜 / 实时 PK（微信云开发）

> 基线：M1/M2 已用**本地存储**跑通单人闭环（学习/复习/闯关/错词本/记忆曲线）。M3 引入云开发，实现**多人同时在线、好友榜、实时房间 PK、班级**。
> 决策：PK = **实时房间对战**；好友关系 = **自建关注/班级**；本次仅出规划，代码待确认后实施。

---

## 1. M3 目标与范围

| 模块 | 内容 | 是否 M3 |
|---|---|---|
| 好友榜 | 总榜 / 坚持榜 / 词库榜 / 周榜，实时刷新 | ✅ |
| 好友关系 | 关注/被关注、班级（群） | ✅ |
| 实时 PK | 匹配→建房→同题池→抢答→实时比分→结算 | ✅ |
| 社交分享 | 战绩/挑战分享卡片 | ✅（基础） |
| 异步挑战 | 离线试卷比拼 | ❌（本次不做，保留接口位） |

**不在 M3**：UGC 联想、TTS 真实发音、手绘插画（留 M4）。

---

## 2. 整体架构

```
小程序端
  ├─ 本地缓存（离线兜底：profile/srs_state 继续保留）
  └─ 云开发
       ├─ 云数据库（实时 watch）
       │    users / friends / classes / pk_rooms / challenges / rank_snapshot
       ├─ 云函数（Node）
       │    login(已有) / follow / class / matchPK / pkAnswer / rankAgg / challenge
       ├─ 云存储（头像/分享图）
       └─ 云调用（openid / 订阅消息）
```

**本地→云迁移策略（关键）**
- `users` 集合 = 云端唯一档案，首次 `login` 自动建档（云函数已写）。
- M1/M2 的本地 `user_profile` 在登录后**合并**进云端（exp/coin/streak/level 取较大值），之后以云端为准，本地仅做离线缓存。
- SRS 进度（`srs_state`）M3 暂不强制上云（量大、隐私低），保留本地；排行榜只取聚合后的 **exp/连续天数/词库进度**，这些来自云端 `users` 即可。

---

## 3. 数据模型（云数据库扩展）

```js
// users（由 login 云函数维护，M1/M2 字段平滑并入）
{
  _openid, nickName, avatar,
  exp, level, coin, streak, lastCheckin,
  badges:[], learnedTotal,          // 累计学词（用于榜）
  bookProgress:{ daily:{stars,passed}, cet4:{...} }, // 词库榜用
  updatedAt
}

// friends（自建关注，无向/有向均可，建议有向）
{ _openid, friendOpenid, createAt }   // 双方各一条 = 互关

// classes（班级/群）
{ classId, name, owner, members:[_openid],
  goalText, createAt }

// pk_rooms（实时房间对战核心）
{
  roomId,
  status: 'waiting' | 'playing' | 'finished',
  mode: 'level' | 'book',          // 按关卡 or 整本
  bookId, level,
  players: [
    { _openid, nickName, score, answered:false, ready:false }
  ],
  questionPool:[{ wordId, correct, options:[...] }], // 服务端生成，答案不下发前端
  qIndex: 0,
  answers: { [_openid]: { qIndex, correct, ts } },
  startedAt, finishedAt,
  winner: _openid | null
}

// challenges（异步挑战占位，M3 仅建表）
{ challengeId, from, bookId, level, questions, scores:{[_openid]:x}, status }

// rank_snapshot（榜单快照，云函数定时/触发更新，客户端 watch 此表）
{ scope:'total'|'streak'|'book_daily'|'week',
  board:[{ _openid, nickName, avatar, value, rank }],
  updatedAt }
```

> `pk_rooms.questionPool` 的 `correct` 与 `options` 中的正确项**只在服务端保存**；前端只收 `options` 与当前 `qIndex`，提交答案后由云函数比对，杜绝改包作弊。

---

## 4. 云函数清单

| 函数 | 职责 |
|---|---|
| `login`（已有） | 静默登录、建/取档案 |
| `syncProfile` | 本地→云合并 exp/coin/streak/进度 |
| `follow` | 关注/取关、互关判定 |
| `class` | 建班、加/退班、班级成员与榜单 |
| `rankAgg` | 按 scope 聚合生成 `rank_snapshot`（定时触发器 + 手动） |
| `matchPK` | 匹配：找 waiting 房或新建；返回 roomId |
| `pkStart` | 房主开局：服务端生成题池、置 playing |
| `pkAnswer` | 提交答案：服务端校验、计分、推进 qIndex、判终 |
| `pkQuit` | 断线/退出处理（判负或托管） |
| `challenge`（占位） | 生成/提交异步挑战（M3 末或 M4） |

**防作弊要点**
- 答案在服务端（`pk_rooms.questionPool[i].correct`），前端永远拿不到。
- `pkAnswer` 校验：必须是当前 `qIndex`、未重复作答、超时（如 8s）判错。
- 计分只认服务端写入；前端分数仅展示。
- 断线：超过阈值（如 15s 无心跳）由 `pkQuit`/定时器判负，避免挂机刷分。

---

## 5. 实时通信方案

- **PK 房间**：双方 `db.collection('pk_rooms').doc(roomId).watch()`。任一方状态变更（题号推进、对方得分、结束）实时推给另一端。
- **排行榜**：客户端 `watch` 对应的 `rank_snapshot` 文档（单文档，体积小、刷新稳）；`rankAgg` 由**定时触发器**（如每 30s）或关键动作后触发更新。
- **班级榜**：复用 `rank_snapshot`，scope 用 `class_<classId>`，仅成员可见（云函数按成员过滤返回）。
- 失败降级：watch 断开自动重连；极端情况下回退为「下拉刷新 / 定时拉取」。

---

## 6. 好友榜设计

- **总榜**：按 `exp` 排序（默认）。
- **坚持榜**：按 `streak` 排序。
- **词库榜**：按 `bookProgress[bookId].stars` 或 `passed` 数。
- **周榜**：`rankAgg` 按本周内 `exp` 增量（需 `users` 记录周初快照或日志表；M3 简化：周榜 = 总榜按本周活跃，或用独立 `weekly_exp` 字段）。
- **好友维度**：总榜叠加「仅看好友」开关（客户端按 `friends` 过滤 `rank_snapshot` 或请求 `rankAgg?friends=1`）。
- 展示：名次、头像、昵称、数值、与我的差距（↑/↓）。

---

## 7. 实时 PK 房间对战流程

```
A 点“匹配” → matchPK
        ├─ 有 waiting 房 → 加入，status=playing 待房主开
        └─ 无 → 新建 waiting 房，等对手
B 匹配进入同房
双方 ready → 房主调 pkStart(服务端生成题池)
        → 推送 qIndex=0 + options
双方 watch 到题 → 抢答（限时）
A 提交 pkAnswer → 服务端校验计分 → 写 answers[A] → 推进 qIndex
        → 双方 watch 到新题
…循环至题池结束 → pkAnswer 检测终局 → winner 写入
        → 双方收到 finished + 结算（胜方 EXP/金币加成，负方安慰奖）
        → 战绩写入 users，触发 rankAgg 更新
```

**匹配**：`matchPK` 按 `bookId+level` 就近匹配；无对手时进入 waiting 并轮询/等待。也支持**邀请好友**：分享带 `roomId` 的卡片，好友打开直进该房。

**题池**：从 `words` 抽 10~15 词，每词 4 选项（同词库干扰项），由 `pkStart` 生成并存 `questionPool`（含 correct）。

---

## 8. 页面结构（新增/改造）

| 页面 | 路径 | 内容 |
|---|---|---|
| 排行榜 | `pages/rank/rank` | 总/坚持/词库/周 切换 + 好友过滤 + 实时刷新 |
| 好友 | `pages/friend/friend` | 关注列表、搜索/二维码加好友 |
| PK 大厅 | `pages/pk/pk` | 匹配 / 邀请 / 历史战绩 |
| PK 房间 | `pages/pkroom/pkroom` | 实时题面、抢答、双方比分、连对特效 |
| 班级 | `pages/class/class` | 建/加班、班级榜、团体目标 |
| 结算 | `pages/pkresult/pkresult` | 胜负、奖励、分享 |

> 原 M1/M2 页面不动；首页加「排行榜 / PK」入口（替换占位）。

---

## 9. 实施步骤（里程碑）

1. **M3.0 云端打通**：`syncProfile` + `login` 联调；本地档案合并上云；确保单人玩法在云端身份下仍正常。
2. **M3.1 排行榜**：`users` 聚合 → `rank_snapshot` → `rank` 页 + `watch` 实时刷新；先做总榜+坚持榜。
3. **M3.2 好友/班级**：`follow` / `class` 云函数 + 好友页 + 班级页 + 榜单按好友/班级过滤。
4. **M3.3 实时 PK**：`matchPK`/`pkStart`/`pkAnswer`/`pkQuit` + `pkroom` 实时页 + 防作弊 + 结算奖励 + 分享。
5. **M3.4 打磨**：周榜、匹配体验、断线重连、性能/费用与监控。

---

## 10. 风险与注意

- **实时数据库限制**：单连接 watch 数有限（约 5~20），PK 房间仅 2 人各 1 路，安全；榜单 watch 单文档，安全。避免在大列表上 watch。
- **并发/乱序**：`pkAnswer` 用数据库 `_.inc` 与条件更新，避免覆盖比分。
- **微信开放能力**：标准小程序**无好友列表 API**（仅小游戏开放数据域），故好友关系走**自建关注**；群排行榜可用 `wx.getGroupCloudStorage`（可选，二期）。
- **费用**：watch 长连接与数据库读写按量计费，学生寒暑假高峰需关注配额；`rankAgg` 定时聚合降低读压力。
- **隐私**：昵称/头像需用户授权；`friends`/`classes` 仅存 openid 映射，不落地明文。

---

## 11. 与 M1/M2 衔接清单

- [ ] `login` 后调用 `syncProfile` 合并本地 exp/coin/streak/level。
- [ ] `users` 增加 `learnedTotal` / `bookProgress`，在闯关结算时同步（改造 `store.addReward`/`saveLevelResult` 顺带写云）。
- [ ] 首页「记忆曲线/错词本」保持本地；其数据不进榜，无影响。
- [ ] 排行榜/ PK 入口在首页与「我的」新增。
- [ ] 本地 `user_profile` 保留为离线缓存，云端为权威源。

---

> 确认后按 M3.0 → M3.1 → M3.2 → M3.3 → M3.4 顺序实现；建议先落地 M3.0+M3.1（云端身份+总榜）拿到可演示成果，再扩好友与实时 PK。
