/**
 * 实时排行榜（Redis Sorted Set）。
 *  member = userId, score = 该用户在本场的最高出价(分)。
 *  ZADD ... GT 保证只升不降；ZREVRANGE 取 Top N，O(logN) 级别，抗高频读写。
 *  昵称/头像存于配套 Hash，避免回查 DB。
 */
import { redis, RedisKeys } from '../infra/redis.js';
import { pool } from '../infra/mysql.js';
import type { RankingEntry } from '@auction/shared';

interface NameMeta {
  nickname: string;
  avatar: string | null;
}

export const ranking = {
  /** 记录一次出价（取该用户最高分）。返回该用户更新后的最高分 */
  async record(
    auctionId: number,
    userId: number,
    meta: NameMeta,
    amount: number
  ): Promise<void> {
    const pipe = redis.pipeline();
    // GT: 仅当新分数更大时更新（同一用户多次出价取最高）
    pipe.zadd(RedisKeys.rankingZSet(auctionId), 'GT', amount, String(userId));
    pipe.hset(RedisKeys.rankingNames(auctionId), String(userId), JSON.stringify(meta));
    await pipe.exec();
  },

  async participantCount(auctionId: number): Promise<number> {
    return redis.zcard(RedisKeys.rankingZSet(auctionId));
  },

  async userBest(auctionId: number, userId: number): Promise<number | null> {
    const s = await redis.zscore(RedisKeys.rankingZSet(auctionId), String(userId));
    return s == null ? null : Number(s);
  },

  /** 取排行榜 Top N */
  async top(auctionId: number, n = 10): Promise<RankingEntry[]> {
    const raw = await redis.zrevrange(
      RedisKeys.rankingZSet(auctionId),
      0,
      n - 1,
      'WITHSCORES'
    );
    if (raw.length === 0) return [];
    const ids: string[] = [];
    const entries: { userId: number; amount: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      ids.push(raw[i]);
      entries.push({ userId: Number(raw[i]), amount: Number(raw[i + 1]) });
    }
    const names = await redis.hmget(RedisKeys.rankingNames(auctionId), ...ids);
    return entries.map((e, idx) => {
      let meta: NameMeta = { nickname: `用户${e.userId}`, avatar: null };
      const rawMeta = names[idx];
      if (rawMeta) {
        try {
          meta = JSON.parse(rawMeta);
        } catch {
          /* ignore */
        }
      }
      return {
        rank: idx + 1,
        userId: e.userId,
        nickname: meta.nickname,
        avatar: meta.avatar,
        bestAmount: e.amount,
        isLeader: idx === 0,
      };
    });
  },

  /** 从 DB 重建（服务重启后恢复 LIVE 场次排行榜） */
  async rebuildFromDb(auctionId: number): Promise<void> {
    const [rows]: any = await pool.query(
      `SELECT b.user_id, MAX(b.amount) AS best,
              SUBSTRING_INDEX(GROUP_CONCAT(b.nickname ORDER BY b.id DESC), ',', 1) AS nickname
       FROM bids b WHERE b.auction_id = ? GROUP BY b.user_id`,
      [auctionId]
    );
    if (!rows.length) return;
    const pipe = redis.pipeline();
    for (const r of rows) {
      pipe.zadd(RedisKeys.rankingZSet(auctionId), 'GT', Number(r.best), String(r.user_id));
      pipe.hset(
        RedisKeys.rankingNames(auctionId),
        String(r.user_id),
        JSON.stringify({ nickname: r.nickname, avatar: null })
      );
    }
    await pipe.exec();
  },

  async clear(auctionId: number): Promise<void> {
    await redis.del(RedisKeys.rankingZSet(auctionId), RedisKeys.rankingNames(auctionId));
  },
};
