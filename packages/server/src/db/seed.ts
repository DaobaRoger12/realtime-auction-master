/**
 * 种子数据：演示账号 + 商品 + 多状态竞拍场次。
 * 用法：npm run db:seed（可重复执行，已存在则跳过）
 */
import { userRepo } from '../repositories/userRepo.js';
import { productRepo } from '../repositories/productRepo.js';
import { auctionRepo } from '../repositories/auctionRepo.js';
import { hashPassword } from '../utils/security.js';
import { closeMysql } from '../infra/mysql.js';
import { closeRedis } from '../infra/redis.js';
import { logger } from '../infra/logger.js';
import { AuctionStatus, UserRole, yuanToFen } from '@auction/shared';

const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/800`;

async function ensureUser(input: {
  username: string;
  password: string;
  nickname: string;
  role: UserRole;
}) {
  const exist = await userRepo.findByUsername(input.username);
  if (exist) return exist;
  return userRepo.create({
    username: input.username,
    passwordHash: await hashPassword(input.password),
    nickname: input.nickname,
    role: input.role,
  });
}

async function main() {
  // 已 seed 过则跳过
  const seededFlag = await userRepo.findByUsername('zhubo');
  if (seededFlag) {
    logger.info('ℹ️  检测到已存在演示数据，跳过 seed');
    await cleanup();
    return;
  }

  const merchant = await ensureUser({
    username: 'zhubo',
    password: '123456',
    nickname: '臻品主播间',
    role: UserRole.MERCHANT,
  });
  const buyers = await Promise.all(
    [
      ['buyer1', '收藏家阿哲'],
      ['buyer2', '珠宝控小美'],
      ['buyer3', '老玩家张哥'],
    ].map(([u, n]) =>
      ensureUser({ username: u, password: '123456', nickname: n, role: UserRole.BUYER })
    )
  );

  const products = await Promise.all([
    productRepo.create(merchant.id, {
      title: '天然缅甸翡翠满绿手镯',
      image: img('jadebangle'),
      category: '珠宝',
      description:
        '天然 A 货缅甸翡翠手镯，种水细腻，satin 满绿，色泽浓阳正匀，圈口 56mm，附权威鉴定证书。' +
        '冰种起光，戴上温润通透，是可遇不可求的收藏级藏品。',
    }),
    productRepo.create(merchant.id, {
      title: '齐白石《虾趣》水墨真迹',
      image: img('inkpainting'),
      category: '艺术品',
      description:
        '齐白石晚年水墨小品《虾趣》，纸本设色，墨虾灵动，笔意酣畅，附传承有序的收藏记录与专家背书。' +
        '艺术与投资价值兼具，藏家不容错过。',
    }),
    productRepo.create(merchant.id, {
      title: 'Hermès Birkin 30 雾面喜马拉雅',
      image: img('luxurybag'),
      category: '二手奢侈品',
      description:
        '爱马仕 Birkin 30 雾面喜马拉雅尼罗鳄，9.5 成新，配全套包装与购买凭证。' +
        '包王中的天花板，保值增值，识货的家人都懂它的稀缺。',
    }),
    productRepo.create(merchant.id, {
      title: '百达翡丽鹦鹉螺 5711/1A',
      image: img('luxurywatch'),
      category: '二手奢侈品',
      description:
        'Patek Philippe Nautilus 5711/1A-010 蓝盘，停产神表，表况极佳，附原厂表盒与证书。' +
        '一表难求，懂表的都在等它。',
    }),
  ]);

  const now = Date.now();

  // ① 正在进行中的竞拍（演示直接可进直播间）
  await auctionRepo.create({
    productId: products[0].id,
    merchantId: merchant.id,
    rules: {
      startPrice: yuanToFen(0),
      bidIncrement: yuanToFen(100),
      capPrice: yuanToFen(50000),
      durationSec: 600,
      antiSnipeWindowSec: 15,
      delaySec: 15,
      maxDelayTimes: 10,
    },
    startAt: new Date(now - 30 * 1000),
    endAt: new Date(now + 600 * 1000),
    status: AuctionStatus.LIVE,
  });

  // ② 即将开始（1 分钟后）
  await auctionRepo.create({
    productId: products[1].id,
    merchantId: merchant.id,
    rules: {
      startPrice: yuanToFen(8888),
      bidIncrement: yuanToFen(500),
      capPrice: yuanToFen(200000),
      durationSec: 300,
      antiSnipeWindowSec: 20,
      delaySec: 20,
      maxDelayTimes: 8,
    },
    startAt: new Date(now + 60 * 1000),
    endAt: new Date(now + 60 * 1000 + 300 * 1000),
    status: AuctionStatus.PENDING,
  });

  // ③ 待开始（主播手动开拍）
  await auctionRepo.create({
    productId: products[2].id,
    merchantId: merchant.id,
    rules: {
      startPrice: yuanToFen(50000),
      bidIncrement: yuanToFen(1000),
      capPrice: null,
      durationSec: 300,
      antiSnipeWindowSec: 15,
      delaySec: 15,
      maxDelayTimes: 10,
    },
    startAt: new Date(now + 3600 * 1000),
    endAt: new Date(now + 3600 * 1000 + 300 * 1000),
    status: AuctionStatus.PENDING,
  });

  logger.info('✅ 种子数据写入完成');
  logger.info('   主播账号: zhubo / 123456');
  logger.info('   买家账号: buyer1 / buyer2 / buyer3  (密码均为 123456)');
  await cleanup();
}

async function cleanup() {
  await closeRedis();
  await closeMysql();
  process.exit(0);
}

main().catch(async (err) => {
  logger.error({ err: err.message }, '❌ seed 失败');
  await closeRedis().catch(() => {});
  await closeMysql().catch(() => {});
  process.exit(1);
});
