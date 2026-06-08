/**
 * 高并发压测脚本 —— 验证「单直播间 1000+ 同时在线」与实时广播能力。
 *
 * 用法：
 *   npm run loadtest -w @auction/server -- <auctionId> [viewers] [bidders] [durationSec]
 *   例：npm run loadtest -w @auction/server -- 4 1000 10 20
 *
 * 它会：
 *   - 建立 N 个观众 WebSocket 连接并加入同一房间（考验 presence 与广播扇出）
 *   - 启动 M 个出价机器人持续竞价（考验锁/乐观锁/事务吞吐）
 *   - 统计：连接建立耗时、收到的广播总数、出价接受/拒绝数、广播平均延迟
 */
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const BASE = process.env.LOADTEST_BASE || 'http://127.0.0.1:4000';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

const auctionId = Number(process.argv[2] || 4);
const VIEWERS = Number(process.argv[3] || 1000);
const BIDDERS = Number(process.argv[4] || 10);
const DURATION = Number(process.argv[5] || 20) * 1000;

let broadcastCount = 0;
let latencySum = 0;
let latencyCount = 0;
let bidAccepted = 0;
let bidRejected = 0;
let connected = 0;
let connectErrors = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureBidder(i: number): Promise<string> {
  const username = `loadbot${i}`;
  const password = '123456';
  // 先尝试注册，已存在则登录
  let res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, nickname: `机器人${i}`, role: 'BUYER' }),
  });
  if (!res.ok) {
    res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  }
  const j: any = await res.json();
  return j.data.token as string;
}

function connectViewer(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      connected += 1;
      ws.send(JSON.stringify({ e: 'join', d: { auctionId } }));
      resolve(ws);
    });
    ws.on('message', (raw) => {
      broadcastCount += 1;
      try {
        const m = JSON.parse(raw.toString());
        if (typeof m.ts === 'number') {
          const lat = Date.now() - m.ts;
          if (lat >= 0 && lat < 60000) {
            latencySum += lat;
            latencyCount += 1;
          }
        }
      } catch {
        /* ignore */
      }
    });
    ws.on('error', () => {
      connectErrors += 1;
      resolve(ws);
    });
  });
}

async function main() {
  console.log(`\n🚀 压测开始：房间#${auctionId}  观众=${VIEWERS}  机器人=${BIDDERS}  时长=${DURATION / 1000}s`);
  console.log(`   目标：${WS_URL}\n`);

  // 1) 批量建立观众连接
  const t0 = Date.now();
  const viewers: WebSocket[] = [];
  const batch = 100;
  for (let i = 0; i < VIEWERS; i += batch) {
    const chunk = await Promise.all(
      Array.from({ length: Math.min(batch, VIEWERS - i) }, () => connectViewer())
    );
    viewers.push(...chunk);
    process.stdout.write(`\r  已建立连接: ${connected}/${VIEWERS}   `);
    await sleep(30);
  }
  const connectMs = Date.now() - t0;
  console.log(`\n✅ ${connected} 个连接建立完成，用时 ${connectMs}ms（${(connected / (connectMs / 1000)).toFixed(0)}/s），失败 ${connectErrors}\n`);

  // 2) 启动出价机器人
  const tokens = await Promise.all(Array.from({ length: BIDDERS }, (_, i) => ensureBidder(i + 1)));
  const bots = tokens.map((token) => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ e: 'join', d: { auctionId } }));
    });
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.e === 'bid_rejected') bidRejected += 1;
      } catch {
        /* ignore */
      }
    });
    return ws;
  });
  await sleep(500);

  const bidTimer = setInterval(() => {
    for (const ws of bots) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ e: 'quick_bid', d: { auctionId, requestId: randomUUID() } }));
      }
    }
  }, 200);

  // bid_accepted 统计：用一个观众累计（广播里含 bid_accepted）
  let lastBidCount = 0;
  const sampler = viewers[0];
  sampler?.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.e === 'bid_accepted') {
        bidAccepted += 1;
        lastBidCount = m.d.bidCount;
      }
    } catch {
      /* ignore */
    }
  });

  // 进度
  const progress = setInterval(() => {
    process.stdout.write(
      `\r  广播总数=${broadcastCount}  成交价更新=${bidAccepted}  当前出价数=${lastBidCount}  拒绝=${bidRejected}  平均延迟=${latencyCount ? (latencySum / latencyCount).toFixed(1) : '-'}ms   `
    );
  }, 500);

  await sleep(DURATION);
  clearInterval(bidTimer);
  clearInterval(progress);

  console.log('\n\n📊 压测结果');
  console.log('────────────────────────────────────────');
  console.log(`  并发观众连接      : ${connected}`);
  console.log(`  连接建立速率      : ${(connected / (connectMs / 1000)).toFixed(0)} conn/s`);
  console.log(`  收到广播消息总数  : ${broadcastCount}`);
  console.log(`  出价机器人        : ${BIDDERS}`);
  console.log(`  出价被接受(成交)  : ${bidAccepted}`);
  console.log(`  出价被拒(规则/限流): ${bidRejected}`);
  console.log(`  广播平均延迟      : ${latencyCount ? (latencySum / latencyCount).toFixed(2) : '-'} ms`);
  console.log(`  扇出放大比        : 1 出价 → ~${connected} 端同步`);
  console.log('────────────────────────────────────────');

  viewers.forEach((w) => w.close());
  bots.forEach((w) => w.close());
  await sleep(500);
  process.exit(0);
}

main().catch((e) => {
  console.error('压测失败', e);
  process.exit(1);
});
