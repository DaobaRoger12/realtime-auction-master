// WebSocket 出价冒烟测试：两位买家轮流竞价，验证广播/排行榜/规则。
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const BASE = 'http://127.0.0.1:4000';
const WS = 'ws://127.0.0.1:4000/ws';
const AUCTION_ID = Number(process.argv[2] || 1);

async function login(username) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: '123456' }),
  });
  const j = await r.json();
  return j.data.token;
}

function connect(token, name) {
  const ws = new WebSocket(`${WS}?token=${token}`);
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.e === 'snapshot')
      console.log(`[${name}] 快照: 当前价=${m.d.auction.currentPrice} 在线=${m.d.onlineCount}`);
    else if (m.e === 'bid_accepted')
      console.log(
        `[${name}] ✅ 出价被接受: ¥${m.d.amount / 100} 领先者=${m.d.leaderId} 出价数=${m.d.bidCount} 参与=${m.d.participantCount} 榜首=${m.d.ranking[0]?.nickname}`
      );
    else if (m.e === 'bid_rejected')
      console.log(`[${name}] ❌ 出价被拒: ${m.d.reason} (${m.d.message}) 最低应价=${m.d.minNextBid}`);
    else if (m.e === 'auction_delayed')
      console.log(`[${name}] ⏱️  延时至 ${m.d.endAt} (+${m.d.addedSec}s)`);
    else if (m.e === 'auction_ended')
      console.log(`[${name}] 🏁 结束: ${m.d.result} 赢家=${m.d.winnerNickname} 成交¥${(m.d.finalPrice||0)/100} 订单=${m.d.orderNo}`);
    else if (m.e === 'presence')
      console.log(`[${name}] 👥 在线=${m.d.onlineCount} 参与=${m.d.participantCount}`);
  });
  return ws;
}

const send = (ws, e, d) => ws.send(JSON.stringify({ e, d }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const [t1, t2] = await Promise.all([login('buyer1'), login('buyer2')]);
  const a = connect(t1, '阿哲');
  const b = connect(t2, '小美');
  await new Promise((r) => a.on('open', r));
  await new Promise((r) => (b.readyState === 1 ? r() : b.on('open', r)));
  send(a, 'join', { auctionId: AUCTION_ID });
  send(b, 'join', { auctionId: AUCTION_ID });
  await wait(500);

  console.log('\n--- 阿哲一键加价 ---');
  send(a, 'quick_bid', { auctionId: AUCTION_ID, requestId: randomUUID() });
  await wait(400);

  console.log('\n--- 小美一键加价（超越） ---');
  send(b, 'quick_bid', { auctionId: AUCTION_ID, requestId: randomUUID() });
  await wait(400);

  console.log('\n--- 阿哲低价出价（应被拒 BELOW_MIN） ---');
  send(a, 'bid', { auctionId: AUCTION_ID, amount: 1, requestId: randomUUID() });
  await wait(400);

  console.log('\n--- 幂等测试：同一 requestId 连发两次 ---');
  const rid = randomUUID();
  send(a, 'bid', { auctionId: AUCTION_ID, amount: 30000, requestId: rid });
  send(a, 'bid', { auctionId: AUCTION_ID, amount: 30000, requestId: rid });
  await wait(600);

  console.log('\n--- 并发测试：阿哲&小美同时抢同一最低应价 ---');
  send(a, 'quick_bid', { auctionId: AUCTION_ID, requestId: randomUUID() });
  send(b, 'quick_bid', { auctionId: AUCTION_ID, requestId: randomUUID() });
  await wait(800);

  console.log('\n完成。');
  a.close();
  b.close();
  process.exit(0);
})();
