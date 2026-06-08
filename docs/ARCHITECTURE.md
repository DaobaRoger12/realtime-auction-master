# 架构与技术设计

本文档阐述「实时竞拍大师」的核心技术方案，重点回应课题两大挑战：**复杂规则零漏洞** 与 **毫秒级实时同步 / 高并发一致性**。

---

## 1. 竞拍状态机

竞拍生命周期由一台**状态机**驱动，所有流转都有唯一权威（服务端），并以 DB 状态 + 乐观锁 version 落地。

```
                 到达 startAt / 主播手动开拍
   ┌─────────┐   ───────────────────────────▶  ┌────────┐
   │ PENDING │                                  │  LIVE  │
   └─────────┘                                  └────────┘
        │                                           │
        │ 主播取消                                    │ 倒计时结束(TIME_UP)
        │                                           │ 或 达封顶价(CAP_REACHED)
        │                                           │ 或 主播手动结束(MANUAL)
        ▼                                           ▼
   ┌──────────┐  ◀── 主播取消 ───────────────  ┌────────┐
   │ CANCELED │                                │ ENDED  │  result: SOLD / UNSOLD
   └──────────┘                                └────────┘
```

- `AuctionEngine`（[services/auctionEngine.ts](../packages/server/src/services/auctionEngine.ts)）负责状态机的**时间维度**：每场 LIVE 竞拍维护一个精确到 `endAt` 的结束定时器；到点触发 `settleByTime`；自动开拍 PENDING 场次；服务重启后从 DB 恢复全部 LIVE 场次（重建定时器 + 排行榜）。
- 结算逻辑（`performSettlement`）在**单事务**内把竞拍置 ENDED 并（成交时）生成订单，`orders.auction_id` 唯一键保证「一场一单」。

---

## 2. 复杂规则的零漏洞实现

全部规则收敛到 [shared/rules.ts](../packages/shared/src/rules.ts) 的**纯函数**，前后端共用同一份逻辑（前端即时反馈、服务端最终裁决），从根上杜绝「前后端规则不一致」。

| 规则 | 实现要点 |
|---|---|
| **0 元起拍** | `startPrice` 允许为 0；首次最低应价 = 起拍价 + 加价幅度 |
| **加价幅度** | 合法出价落在网格 `startPrice + k·increment`；`(amount − startPrice) % increment === 0` |
| **封顶价** | `amount > capPrice` 直接拒绝；`amount === capPrice` 允许一口价（即使不在网格上），命中即触发**自动成交** |
| **自动延时（防狙击）** | 结束前 `antiSnipeWindowSec` 窗口内出价 → `endAt = now + delaySec`；`delayCount < maxDelayTimes` 限制无限延时 |
| **异常取消** | 主播对 PENDING/LIVE 场次取消，引擎清定时器并广播 `AUCTION_CANCELED` |

金额一律以**「分」整数**存储与传输，杜绝浮点误差。

---

## 3. 出价管线：高并发下的数据一致性

「绝对不允许一笔出价扣两次钱 / 排名错乱」是本系统的红线。出价路径（[services/bidService.ts](../packages/server/src/services/bidService.ts)）层层设防：

```
出价请求
  │
  ├─① 幂等缓存        Redis: 同一 requestId 命中则直接返回上次结果（防重复提交/网络重发）
  ├─② 服务端限流      Redis SET NX PX：同用户最小出价间隔（与前端防抖节流呼应）
  ├─③ 分布式锁        Redis 锁 lock:auction:{id}（带 token + Lua 安全释放），同一竞拍串行
  │      │
  │      ├─④ 规则校验   validateBid()（起拍/加价/封顶/已领先）
  │      ├─⑤ DB 事务 + 乐观锁
  │      │     INSERT bids（唯一键 (auction_id, request_id) 兜底幂等）
  │      │     UPDATE auctions ... WHERE id=? AND version=? AND status='LIVE'
  │      │        ↑ affectedRows=0 ⇒ 版本冲突，回滚并返回 CONFLICT
  │      ├─⑥ 封顶成交   达封顶价则同事务内 settle + 建单
  │      └─⑦ 排行榜+广播 ZSET 更新 → Pub/Sub 广播 BID_ACCEPTED / DELAYED / ENDED
  │
  └─ 释放锁，缓存结果（幂等）
```

**为什么「分布式锁 + 乐观锁」双保险？**
- 分布式锁把同一竞拍的出价**串行化**，是性能与正确性的第一道闸；
- 乐观锁 `version` 是**兜底**：即使锁因 TTL 过期/网络分区失效，DB 的 `WHERE version=?` 也能拦截并发写，绝不产生「同价双成交」；
- DB 唯一键 `(auction_id, request_id)` 是幂等的**最终防线**。

三层防线相互独立，任一层失效都不会破坏一致性。压测中 10 个机器人疯狂抢拍，系统始终只接受合法的、严格递增的出价，其余以 `ALREADY_LEADING / BELOW_MIN / RATE_LIMITED` 精确拒绝。

---

## 4. 实时通信：毫秒级同步与稳定性

### 4.1 WebSocket Hub（[ws/hub.ts](../packages/server/src/ws/hub.ts)）
- **房间路由**：一个连接可加入多个竞拍房间，消息按房间精确投递，多直播间互不干扰。
- **心跳保活**：服务端定时 `ping`，客户端 `pong`；超时连接 `terminate`。客户端亦定时发应用层 `PING`。
- **断线重连**：客户端**指数退避 + 抖动**重连（[mobile ws.ts](../packages/mobile/src/lib/ws.ts)），重连后自动重新 `join` 此前房间，无缝恢复。
- **服务器对时**：每条下行消息携带 `ts`，配合 `welcome/pong` 的 `serverTime` 与 RTT/2 估算时钟偏移，`serverNow()` 让所有端的倒计时**毫秒级一致**，杜绝「各人看到的结束时间不同」。

### 4.2 跨实例广播与房间级隔离（[services/bus.ts](../packages/server/src/services/bus.ts)）
所有需要「广播给房间内所有人」的事件统一发布到 Redis `room:{auctionId}` 频道；每个服务实例 `psubscribe room:*` 后投递给本地连接。

→ 这使系统天然**水平可扩展**：加机器即可分摊连接，单直播间消息仍精确路由、互不串台。这是支撑「单直播间 1000+ 同时在线」的基础设施。

---

## 5. Redis 数据结构一览

| 用途 | 结构 | Key |
|---|---|---|
| 出价分布式锁 | String(NX PX) + token | `lock:auction:{id}` |
| 出价幂等 | String(EX) 存结果 | `idem:bid:{requestId}` |
| 出价限流 | String(NX PX) | `rate:bid:{auctionId}:{userId}` |
| 实时排行榜 | **Sorted Set**（score=最高出价） | `auction:{id}:rank` |
| 排行榜昵称 | Hash | `auction:{id}:names` |
| 在线人数 | Set（sessionId） | `auction:{id}:online` |
| 房间广播 | Pub/Sub Channel | `room:{id}` |

排行榜用 `ZADD GT` 保证只升不降，`ZREVRANGE` 取 Top N 为 O(logN)，抗高频读写；参与人数用 `ZCARD`。

---

## 6. 高并发优化：presence 合并节流

**问题**：最初每个用户 `join` 都立即向房间广播一次 PRESENCE。1000 人建连时，第 k 个 join 要广播给前 k−1 人 → 总量 O(N²) ≈ 50 万条，造成消息风暴、延迟升高。

**优化**：按房间**合并节流**——presence 变更只标记房间「脏」，由一个 ~400ms 的合并定时器统一广播最新值（每房间 ≤ 2.5 次/秒），与 join 速率解耦，把广播从 O(N²) 降为 O(N)。

**实测对比（1000 观众 + 10 机器人，15s，单机本地）：**

| 指标 | 优化前 | 优化后 | 提升 |
|---|---|---|---|
| 建连速率 | 65 conn/s | **644 conn/s** | ~10× |
| 广播消息总量 | 851,091 | **78,100** | ~11× ↓ |
| 平均广播延迟 | 219 ms | **18.3 ms** | ~12× ↓ |
| 1000 并发连接 | 0 失败 | 0 失败 | — |

> 复现：`npm run loadtest -w @auction/server -- <auctionId> 1000 10 15`

---

## 7. 可观测性与兜底
- `GET /health`：实时返回 MySQL/Redis 连通性、WS 连接数/房间数，可用于探活与监控告警。
- 结构化日志（pino）：竞拍开始/结束/延时、出价异常、锁冲突等关键事件可追溯。
- AI 调用**全部带模板兜底**：第三方不可用时接口仍返回可用内容，不拖垮主链路。
- 服务重启**自愈**：从 DB 恢复 LIVE 场次定时器与排行榜，避免「重启即丢拍」。
