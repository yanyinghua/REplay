# M3 细化：实时 PK 题池与抢答时序

> 配套 `M3_PLAN.md` §7。本文把"题池怎么出"和"抢答一回合怎么走"细化到可实现的程度。
> 原则：**服务端权威**（答案/计时/计分都在云函数，前端只渲染）、**同一题池**（双方公平竞速）、**事务串行**（并发不双计）。

---

## A. 题池生成（pkStart）

### A.1 目标
- 一局 PK 用**一份共享题池**，双方看到**完全相同的词、完全相同的选项顺序**，保证公平竞速。
- 每题 4 选 1（拼写），正确项**只存服务端**，前端只收 `options`（拼写字串数组），永远收不到正确下标。

### A.2 题池字段（room.questionPool[i]）

```js
{
  wordId,
  display: {                 // 下发给前端的全部内容
    emoji: '🍎',
    meaning: '苹果',
    phonetic: '/ˈæpəl/',
    options: ['apple', 'apply', 'maple', 'ample']  // 已打乱
  },
  correct: 2                 // ✅ 仅服务端保存，不下发
}
```

### A.3 生成算法（pkStart 云函数）

```
输入: bookId, level, count=12
1. 取词: words = db.words.where({bookId}).(level 区间)  // 不足则补全书随机
2. 随机抽取 count 个词（去重）
3. for 每个词 w:
     a. correct = w.spell
     b. 干扰项 = 从同 bookId 且 spell != correct 的词里随机取 3 个（互不相同）
     c. options = shuffle([correct, d1, d2, d3])
     d. correctIndex = options.indexOf(correct)        // 仅服务端记录
     e. push { wordId, display:{emoji,meaning,phonetic,options}, correct: correctIndex }
4. 建/更新 room:
     questionPool = 上述数组
     players[*].score = 0; players[*].locked=false
     qIndex = 0; roundStart = now; roundResolved=false
     status = 'playing'
```

**公平性细节**
- 选项顺序在服务端一次性 `shuffle` 并固定，双方一致；不在前端再洗牌（否则双方选项位置不同，不公平竞争）。
- 干扰项限定**同词库**，避免 "apple vs elephant" 这种送分题。
- 题量默认 12（可在 `mode` 里配 10/15）。双方都从 `qIndex=0` 开始，顺序一致。

### A.4 客户端如何拿题
- 创建/加入房间后，`watch(roomId)`。
- 收到 `status==='playing'` 且 `qIndex=k` → 渲染 `questionPool[k].display`。
- **永远不读 `questionPool[k].correct`**（前端拿不到，也别在前端算）。

---

## B. 单局状态机

```
        matchPK / 邀请加入
              │
              ▼
         [waiting]  ──(双方 ready)──►  pkStart 生成题池
              │                          │
              │                          ▼
              │                     [playing]  ◄─── 每轮循环
              │                          │  qIndex 0..N-1
              │                          │  每轮: 显示→抢答→结算→下一轮
              │                          ▼
              │                     [finished]  (qIndex==N)
              │                          │
              └──────────────────►  结算奖励 + 写 users + rankAgg
```

每轮（round）子状态：`qIndex` + `roundStart` + 每位玩家的 `answers[openid] = {qIndex, correct, ts}` + `locked`。

---

## C. 单轮抢答时序（核心）

### C.1 规则
- 每轮 **限时 T=8s**（可在 mode 配）。双方**同时**看到题，先提交**正确**答案者"抢到"本轮。
- 提交**正确** → 得 `base(10) + 速度奖励`，本轮立即结束，对方本轮 0 分。
- 提交**错误** → 该玩家本轮**锁定**（不能再答），不得分；对手仍可继续抢，直到有人对或超时。
- **超时**（无人正确）→ 本轮 0:0，进入下一题。
- 速度奖励：`bonus = max(0, round((T - elapsed)/T * 5))`，即最快 ≈15 分，临尾 ≈10 分。`elapsed` 用**服务端收到时刻 - roundStart**（以服务器时间为准，避免客户端时钟作弊）。

### C.2 并发与权威（事务）

所有改变分数的写操作（`pkAnswer` / `pkTimeout`）都在**数据库事务**中执行，保证并发串行、不双计、不双推进：

```
pkAnswer(roomId, optionIndex):
  tx = db.startTransaction()
  room = tx.pk_rooms.doc(roomId).get()           // 行锁
  guard: status==='playing' && !roundResolved
  me = room.players[myOpenid]
  guard: me.answers.qIndex !== room.qIndex        // 本轮未答过
  guard: now - room.roundStart <= T               // 未超时
  correctIdx = room.questionPool[room.qIndex].correct

  if optionIndex === correctIdx:                  // ✅ 抢到
      pts = 10 + max(0, round((T - (now-roundStart))/T * 5))
      me.score += pts
      me.answers = {qIndex, correct:true, ts:now}
      if room.qIndex + 1 >= pool.length:
          room.status = 'finished'; room.winner = myOpenid
      else:
          room.qIndex += 1; room.roundStart = now; room.roundResolved = false
          room.lastRound = {winner: myOpenid, type:'correct'}
  else:                                           // ❌ 答错，锁定本轮
      me.answers = {qIndex, correct:false, ts:now}
      me.locked = true                            // 本轮不可再答
  tx.update(room); tx.commit()
  → watch 推给双方：新 qIndex / 新分数 / lastRound
```

```
pkTimeout(roomId):                                // 客户端倒计时归零时调用（幂等）
  tx = db.startTransaction()
  room = tx.pk_rooms.doc(roomId).get()
  guard: status==='playing' && !roundResolved && now - room.roundStart > T
  if room.qIndex + 1 >= pool.length:
      room.status='finished'; room.winner = higherScoreOpenid or null(平局)
  else:
      room.qIndex += 1; room.roundStart = now
      room.lastRound = {winner:null, type:'timeout'}
      // 重置双方本轮 locked/answers 以便下一轮
      room.players[*].locked = false
  tx.update(room); tx.commit()
```

> 为何要事务：两位玩家可能几乎同时点正确项。事务串行化后，**第一个提交者**拿到分数并推进 `qIndex`；第二个在事务里读到已推进的状态，被 `guard` 拒绝（记为 late，不得分）。避免"双计/双推进"。

> 超时推进的并发同理：两个客户端同时调 `pkTimeout`，事务保证只推进一次（`guard: !roundResolved && expired`）。

### C.3 完整一回合 ASCII 时序

```
 客户端A                  云函数(pkAnswer)              云函数(pkTimeout)       客户端B
   │                          │                              │                    │
   │ 显示 Q3 (T=8s)           │                              │                    │ 显示 Q3
   │──────────────────────────┼──────────────────────────────┼───────────────────│
   │  t=2s 点正确项 ──────────►│ tx开始,读room              │                    │
   │                          │ 校验通过, +15分, qIndex→4   │                    │
   │                          │ 提交, roundResolved推进 ──────watch──► 显示"对方抢到"
   │◄──── watch: Q4 + 分数 ────│                              │                    │ 显示 Q4, 重置计时
   │ 渲染 Q4, 重置计时         │                              │                    │
   │                          │                              │                    │
   │  (B 在 t=3s 也点了正确)   │◄──── pkAnswer(B) ───────────│                    │
   │                          │ tx读room: qIndex已是4≠3 → guard失败, 记late        │
   │                          │ 返回 {late:true} ────────────►│ 显示"慢了一步"      │
   │                          │                              │                    │
   │  (若一直无人答对)         │                              │◄── t=8s 调pkTimeout─│
   │                          │◄─────────────────────────────│ tx: expired→推进Q4 │
   │◄──── watch: Q4, 0:0 ──────│                              │                    │
```

---

## D. 断线 / 重连

- 双方各开 `watch`；UI 监听 `onError`/`onClose`，断线自动 `watch` 重连。
- **对手离线检测**：客户端周期（如每 3s）调用 `pkHeartbeat` 更新 `lastSeen`；本地发现对手 `lastSeen` 超过 15s → 显示"对方离线"，并允许本方调用 `pkQuit` 提前结算（winner=在线方）。
- 重连回来：重新 `watch(roomId)`，按服务端 `qIndex/score/status` 恢复界面；若已 `finished` 则直接进结算页。
- 防挂机刷分：`pkAnswer` 的超时 guard + `pkHeartbeat` 缺失判负，确保离线方不凭空得分。

---

## E. 客户端交互要点（给 UI 的约定）

- 每轮显示**双方实时分数** + 当前 `qIndex+1 / N` + 倒计时环（T 秒）。
- 提交后：
  - 自己正确 → "抢到啦 +X" 连对特效位（combo 可叠加速度奖励）。
  - 自己错误 → 红抖 + "答错了，本轮锁定"。
  - 对方先对 → "对方抢到了"，本轮不可再点。
- 锁定态：本方 `locked===true` 时，选项禁用、倒计时继续走（仅展示），直到下一轮 `watch` 重置。
- 终局：双方同步收到 `status==='finished'` → 跳转 `pkresult`，展示胜负/奖励/分享。

---

## F. 云函数签名（M3 实现清单细化）

| 函数 | 入参 | 关键动作 |
|---|---|---|
| `matchPK` | `{bookId, level, roomId?}` | 有 waiting 房则加入；否则新建；返回 `roomId` |
| `pkReady` | `{roomId}` | 标记 ready；双方 ready → 触发 `pkStart` |
| `pkStart` | `{roomId}` | 事务/生成题池、置 playing（见 A.3） |
| `pkAnswer` | `{roomId, optionIndex}` | 事务校验+计分+推进（见 C.2） |
| `pkTimeout` | `{roomId}` | 事务超时推进（幂等，见 C.2） |
| `pkHeartbeat` | `{roomId}` | 更新 `lastSeen` |
| `pkQuit` | `{roomId}` | 离线/退出结算，winner=对方，写奖励 |
| `pkResult` | `{roomId}` | 读终局，算奖励（胜方 EXP+金币加成，负方安慰奖），写 `users`+`rankAgg` |

奖励建议：`win +30 EXP / +15 金币`，`lose +10 EXP / +5 金币`，平局各 +15 EXP；连胜记入 `badges`（"PK 十连胜"）。

---

## G. 与 M3_PLAN 衔接

- 本文替换 `M3_PLAN.md` §7 的概要，作为 M3.3 的实现依据。
- `pk_rooms` 字段以本文 A.2 / B 为准（新增 `roundStart / roundResolved / locked / lastRound / lastSeen`）。
- 防作弊三件套在本文落地：**答案仅服务端**、**服务端计时**、**事务串行**。
- 邀请好友：复用 `matchPK({roomId})` 入口，分享卡片带 `roomId`。

---

> 确认后，M3.3 实现顺序建议：① `pk_rooms` 集合与字段 → ② `pkStart` 题池生成 → ③ `pkAnswer`/`pkTimeout` 事务抢答 → ④ `pkroom` 实时页（watch+倒计时+反馈）→ ⑤ `pkResult` 结算与奖励 → ⑥ 断线/重连打磨。
