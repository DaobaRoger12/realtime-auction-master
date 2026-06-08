# 🔨 实时竞拍大师 · 抖音电商直播竞拍全栈系统

> 2026 抖音电商 AI 全栈训练营课题 ——「实时竞拍大师」
> 一套从 **商品上架 → 规则配置 → 实时出价 → 动态排名 → 竞拍成交** 的高并发实时直播竞拍全栈系统。

围绕课题两大核心挑战打磨：**复杂规则零漏洞** 与 **毫秒级实时同步**，并在高并发架构、竞价氛围体验、AI 全栈应用三个方向做了深度优化。

---

## ✨ 亮点速览

| 维度 | 实现 |
|---|---|
| 🧩 **复杂规则** | 0 元起拍 · 加价幅度 · 封顶自动成交 · 防狙击自动延时 · 主播取消，全部以**状态机 + 共享纯函数**零漏洞实现 |
| ⚡ **实时同步** | WebSocket 长连接 + 心跳保活 + **断线指数退避重连** + **服务器对时**，倒计时毫秒级一致 |
| 🔒 **数据一致性** | **Redis 分布式锁**（出价串行/幂等）+ **MySQL 乐观锁 version**（并发兜底）双保险，杜绝一笔出价扣两次钱 / 排名错乱 |
| 🚀 **高并发** | 单直播间 **1000+ 同时在线**实测 0 失败；Redis ZSET 排行榜、Pub/Sub 房间级隔离；presence 合并节流把广播从 O(N²) 降到 O(N)，延迟 **219ms → 18ms** |
| 💫 **竞价氛围** | 「🎉 领先 / ⚡ 被超越 / ⏱️ 延时」情绪动画 + 音效、实时排行榜布局动画、毫秒紧张倒计时、漂浮爱心、AI 拍卖师话术 |
| 🤖 **AI 全栈** | 接入**豆包 Doubao-Seed-2.0-lite**（火山方舟）：一键生成商品文案 + 智能推荐竞拍规则、实时拍卖师话术，全部带模板兜底 |
| 📊 **可观测性** | `/health` 健康检查（MySQL/Redis/WS 连接数）、结构化日志、断连重连可视化、异常告警 |

---

## 🏗️ 系统架构

```
┌────────────────────────┐     ┌────────────────────────┐
│  商家/主播 PC 管理后台   │     │   用户端 移动 H5 直播间   │
│  React + TS + AntD      │     │  React + TS + Framer    │
│  发布/管理/订单/实时监播 │     │  浏览/出价/排名/结果/支付 │
└───────────┬────────────┘     └───────────┬────────────┘
            │ REST + WebSocket              │ REST + WebSocket
            └───────────────┬───────────────┘
                            ▼
        ┌──────────────────────────────────────────┐
        │            Node.js 后端 (Fastify)          │
        │  ┌────────────┐  ┌──────────────────────┐  │
        │  │ REST API   │  │  WebSocket Hub        │  │
        │  │ 认证/商品/  │  │  房间路由/心跳/对时    │  │
        │  │ 竞拍/订单/AI│  │  Pub/Sub 投递         │  │
        │  └─────┬──────┘  └──────────┬───────────┘  │
        │        ▼                    ▼              │
        │  ┌──────────────────────────────────────┐ │
        │  │           核心服务层                   │ │
        │  │  AuctionEngine（状态机/定时器/结算）    │ │
        │  │  bidService（锁+乐观锁+幂等+规则+广播）  │ │
        │  │  ranking（ZSET 排行榜） aiService（豆包）│ │
        │  └─────┬──────────────────────┬──────────┘ │
        └────────┼──────────────────────┼────────────┘
                 ▼                      ▼
        ┌────────────────┐    ┌──────────────────────┐
        │     MySQL       │    │        Redis          │
        │ 持久化+乐观锁    │    │ 分布式锁/ZSET排行榜/   │
        │ 用户/商品/竞拍/  │    │ Pub/Sub/状态缓存/      │
        │ 出价/订单        │    │ presence/幂等/限流     │
        └────────────────┘    └──────────────────────┘
```

> 详细技术设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；AI 使用方法论见 [docs/AI_USAGE.md](docs/AI_USAGE.md)。

---

## 🛠️ 技术栈

| 层 | 选型 |
|---|---|
| Monorepo | npm workspaces（`shared` 前后端共享类型/事件/规则纯函数） |
| 后端 | Node.js + TypeScript + **Fastify** + 原生 **ws** |
| 数据库 | **MySQL 8**（乐观锁 version 列） |
| 缓存/实时 | **Redis 7**（分布式锁 / ZSET / Pub/Sub / 状态缓存 / 幂等 / 限流） |
| 管理后台 | React 18 + TypeScript + **Ant Design 5**（暗色主题） |
| 移动 H5 | React 18 + TypeScript + **Framer Motion**（氛围动画）+ Zustand + WebAudio 音效 |
| AI | 豆包 Doubao-Seed-2.0-lite（火山方舟 OpenAI 兼容协议） |

---

## 🚀 快速开始

### 0. 前置依赖
- Node.js ≥ 20
- **MySQL 8 / MariaDB** 与 **Redis 7**（二选一启动方式）

### 1. 安装依赖并构建共享包
```bash
npm install
npm run build:shared
```

### 2A. 启动基础设施 —— 方式一：Docker（推荐）
```bash
npm run infra:up          # 拉起 MySQL + Redis 容器
```

### 2B. 启动基础设施 —— 方式二：本地服务（无 Docker 时）
```bash
# macOS Homebrew 为例
brew services start mariadb
brew services start redis
# 建库建用户（与 packages/server/.env 一致）
mysql -u root -e "CREATE DATABASE IF NOT EXISTS auction DEFAULT CHARSET utf8mb4;
  CREATE USER IF NOT EXISTS 'auction'@'localhost' IDENTIFIED BY 'auction_pwd';
  GRANT ALL ON auction.* TO 'auction'@'localhost'; FLUSH PRIVILEGES;"
```

### 3. 迁移 + 种子数据
```bash
npm run db:migrate
npm run db:seed
```

### 4. 启动后端 + 两个前端
```bash
npm run dev:server   # 后端  http://localhost:4000
npm run dev:admin    # 管理后台 http://localhost:5173
npm run dev:mobile   # 移动 H5  http://localhost:5174
# 或一键全开：
npm run dev
```

### 5. 登录体验
| 端 | 地址 | 账号 |
|---|---|---|
| 商家/主播后台 | http://localhost:5173 | `zhubo` / `123456` |
| 用户移动端 | http://localhost:5174 | `buyer1`、`buyer2`、`buyer3` / `123456` |

> 移动端建议用 Chrome 设备模式（iPhone）打开，体验最佳。

---

## 🎬 演示流程（建议录屏脚本）

1. **商家后台**：登录 → 「发布竞拍」→ 填写商品名/品类 → 点「✨ AI 生成」→ 豆包自动生成卖点文案与推荐规则 → 配置加价幅度/封顶/延时 → 发布（立即开拍）。
2. **用户移动端**（开两个浏览器/两个账号）：进入直播间 → 看到实时倒计时、当前价、在线人数。
3. **多人竞价**：A 出价 → 看到「🎉 领先」动画+音效；B 一键加价超越 → A 收到「⚡ 被超越」反馈，排行榜实时重排。
4. **防狙击延时**：临近结束时出价 → 全场「⏱️ 竞拍延时」，倒计时自动延长。
5. **封顶成交**：出价达封顶价 → 自动成交，弹出结果页 → 赢家「💳 模拟支付」→ 生成订单。
6. **商家实时监播**：后台「监播」页实时看到出价流、排行榜、在线人数；可「取消异常竞拍」。
7. **高并发压测**：`npm run loadtest -w @auction/server -- <auctionId> 1000 10 15`，展示 1000 并发、扇出与延迟数据。

---

## 🔬 高并发压测

```bash
# 参数：<auctionId> [观众数=1000] [出价机器人=10] [时长秒=20]
npm run loadtest -w @auction/server -- 5 1000 10 15
```
实测结果（M 系列 Mac，单机本地）：

```
并发观众连接      : 1000   （0 失败）
连接建立速率      : 644 conn/s
广播平均延迟      : 18.3 ms
扇出放大比        : 1 次出价 → ~1000 端同步
```
> presence 合并节流优化前后对比：延迟 **219ms → 18ms**，广播量 **85万 → 7.8万**（详见 ARCHITECTURE.md）。

---

## 📁 项目结构

```
douyinxiangmu/
├── docker-compose.yml          # MySQL + Redis
├── packages/
│   ├── shared/                 # 前后端共享：枚举/模型/WS事件/规则纯函数
│   ├── server/                 # 后端
│   │   └── src/
│   │       ├── config, infra/  # 环境、MySQL、Redis、日志
│   │       ├── db/             # schema.sql、migrate、seed
│   │       ├── repositories/   # 数据访问（含乐观锁 SQL）
│   │       ├── services/       # 引擎/出价/锁/排行榜/结算/AI/总线
│   │       ├── ws/             # WebSocket Hub
│   │       ├── routes/         # REST API
│   │       └── scripts/        # 压测、冒烟测试
│   ├── admin/                  # 商家管理后台 (React + AntD)
│   └── mobile/                 # 用户移动 H5 (React + Framer Motion)
└── docs/                       # 架构与 AI 使用文档
```

---

## 📊 评分维度对照

| 维度 | 本项目对应实现 |
|---|---|
| 工程完整度（50%） | 全链路闭环：采集（出价/行为）→ 校验（规则+状态机）→ 持久化 → 网关 → 前端氛围交互；断连重连、异常兜底、缓存防击穿、数据一致性、`/health` 可观测性 |
| 技术深度与创新（25%） | 房间级 WS 路由隔离、出价幂等（分布式锁+乐观锁+DB唯一键三重）、跨端状态同步对时、presence 合并节流（O(N²)→O(N)） |
| AI 使用（15%） | 豆包文案/规则生成 + 实时话术；带兜底、可追溯；详见 AI_USAGE.md |
| 材料完整度（10%） | README + 架构文档 + AI 文档 + 压测脚本 + 种子演示数据 |

---

## 🔐 安全说明
- 火山方舟 API Key 放在 `packages/server/.env`（已被 `.gitignore` 忽略，**切勿提交/泄露**）。
- 仅用于本课题项目，账号共用请注意保密。
```
