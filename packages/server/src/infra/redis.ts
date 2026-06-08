/**
 * Redis 客户端。
 *  - redis     : 主客户端，用于普通命令 + 发布(publish) + Lua 脚本
 *  - redisSub  : 订阅专用客户端（订阅模式下连接不能再执行普通命令，必须独立）
 *
 * 用途：分布式锁、出价幂等、实时排行榜(ZSET)、状态缓存、跨实例 Pub/Sub 广播。
 */
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const baseOptions = {
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
  // 启动期重试，避免 docker 容器尚未就绪
  retryStrategy: (times: number) => Math.min(times * 200, 2000),
  maxRetriesPerRequest: 3,
};

export const redis = new Redis(baseOptions);
export const redisSub = new Redis(baseOptions);

redis.on('error', (e) => logger.error({ err: e.message }, 'Redis 主客户端错误'));
redisSub.on('error', (e) => logger.error({ err: e.message }, 'Redis 订阅客户端错误'));

export async function pingRedis(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== 'PONG') throw new Error('Redis ping 失败');
  logger.info('✅ Redis 连接成功');
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), redisSub.quit()]);
}

/* ----------------------------- Redis Key 命名规范 ----------------------------- */
export const RedisKeys = {
  /** 竞拍出价的分布式锁 */
  bidLock: (auctionId: number) => `lock:auction:${auctionId}`,
  /** 出价幂等键（requestId 维度） */
  bidIdempotency: (requestId: string) => `idem:bid:${requestId}`,
  /** 竞拍状态热缓存（JSON） */
  auctionCache: (auctionId: number) => `auction:${auctionId}:state`,
  /** 实时排行榜：member=userId, score=该用户最高出价(分) */
  rankingZSet: (auctionId: number) => `auction:${auctionId}:rank`,
  /** 排行榜昵称映射 */
  rankingNames: (auctionId: number) => `auction:${auctionId}:names`,
  /** 房间在线人数集合（sessionId） */
  presenceSet: (auctionId: number) => `auction:${auctionId}:online`,
  /** 跨实例广播频道（房间级隔离） */
  roomChannel: (auctionId: number) => `room:${auctionId}`,
  /** 用户出价限流（防抖/节流） */
  bidRate: (auctionId: number, userId: number) => `rate:bid:${auctionId}:${userId}`,
} as const;
