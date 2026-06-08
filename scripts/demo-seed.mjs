// 一键生成新鲜的演示竞拍（录屏前运行，保证场次处于 LIVE 且足够时长）。
// 用法：node scripts/demo-seed.mjs   （需后端已在 4000 运行）
const BASE = process.env.DEMO_BASE || 'http://127.0.0.1:4000';

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json();
  if (!j.data?.token) throw new Error('登录失败，请确认已 db:seed 且后端运行中');
  return j.data.token;
}

async function createAuction(token, product, rules) {
  const r = await fetch(`${BASE}/api/auctions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ product, rules }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(j.message);
  return j.data;
}

const img = (s) => `https://picsum.photos/seed/${s}/800/800`;

const SCENES = [
  {
    name: '常规场（演示完整竞价）',
    product: { title: '天然缅甸翡翠满绿手镯', image: img('demojade'), category: '珠宝', description: '天然A货缅甸翡翠手镯，冰种满绿，种水细腻，圈口56mm，附权威证书。0元起拍，价高者得！' },
    rules: { startPrice: 0, bidIncrement: 10000, capPrice: 300000, durationSec: 300, antiSnipeWindowSec: 20, delaySec: 15, maxDelayTimes: 10 },
  },
  {
    name: '短时低封顶（演示自动延时+封顶成交）',
    product: { title: '齐白石《虾趣》水墨真迹', image: img('demoink'), category: '艺术品', description: '齐白石晚年水墨小品《虾趣》，墨虾灵动，传承有序，附专家背书。' },
    rules: { startPrice: 0, bidIncrement: 10000, capPrice: 80000, durationSec: 120, antiSnipeWindowSec: 25, delaySec: 15, maxDelayTimes: 10 },
  },
  {
    name: '待开始（演示主播手动开拍）',
    product: { title: 'Hermès Birkin 30 雾面喜马拉雅', image: img('demobag'), category: '二手奢侈品', description: '爱马仕 Birkin 30 雾面喜马拉雅，9.5成新，配全套包装与购买凭证。' },
    rules: { startPrice: 500000, bidIncrement: 50000, capPrice: null, durationSec: 300, antiSnipeWindowSec: 15, delaySec: 15, maxDelayTimes: 10 },
    startAt: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 小时后 → 保持 PENDING，可手动开拍
  },
];

(async () => {
  const token = await login('zhubo', '123456');
  console.log('🎬 生成演示竞拍中...\n');
  for (const s of SCENES) {
    const r = await fetch(`${BASE}/api/auctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product: s.product, rules: s.rules, startAt: s.startAt }),
    });
    const j = await r.json();
    if (j.code === 0) console.log(`  ✅ #${j.data.id}  ${j.data.product.title}  [${j.data.status}]  — ${s.name}`);
    else console.log(`  ❌ ${s.name}: ${j.message}`);
  }
  console.log('\n完成！打开 http://localhost:5174 进入直播间开录。');
  process.exit(0);
})().catch((e) => {
  console.error('失败：', e.message);
  process.exit(1);
});
