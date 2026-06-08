/**
 * 在线人数统计（Redis Set，跨实例聚合）。
 * member = sessionId，SCARD 即全局在线数；支持多实例部署下的准确计数。
 */
import { redis, RedisKeys } from '../infra/redis.js';

export const presence = {
  async join(auctionId: number, sessionId: string): Promise<number> {
    await redis.sadd(RedisKeys.presenceSet(auctionId), sessionId);
    return redis.scard(RedisKeys.presenceSet(auctionId));
  },
  async leave(auctionId: number, sessionId: string): Promise<number> {
    await redis.srem(RedisKeys.presenceSet(auctionId), sessionId);
    return redis.scard(RedisKeys.presenceSet(auctionId));
  },
  async count(auctionId: number): Promise<number> {
    return redis.scard(RedisKeys.presenceSet(auctionId));
  },
};
