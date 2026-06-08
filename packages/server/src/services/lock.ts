/**
 * Redis 分布式锁（单实例 Redlock 简化版）。
 *
 *  - acquire: SET key token NX PX ttl  —— 原子占锁，token 防误删
 *  - release: Lua 脚本比对 token 后删除 —— 避免释放别人的锁
 *  - withLock: 自旋获取（短重试），保证同一竞拍的出价串行处理
 *
 * 出价路径用它把「校验 → 乐观锁更新 → 写流水」串成临界区，
 * 配合数据库乐观锁形成「双保险」，杜绝并发下的重复扣款 / 排名错乱。
 */
import { redis } from '../infra/redis.js';
import { uuid } from '../utils/helpers.js';
import { sleep } from '../utils/helpers.js';

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export class LockError extends Error {
  constructor(msg = '获取锁失败，请重试') {
    super(msg);
    this.name = 'LockError';
  }
}

export async function acquire(key: string, ttlMs: number): Promise<string | null> {
  const token = uuid();
  const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
  return ok === 'OK' ? token : null;
}

export async function release(key: string, token: string): Promise<void> {
  try {
    await redis.eval(RELEASE_LUA, 1, key, token);
  } catch {
    /* 释放失败不致命：锁会随 TTL 自动过期 */
  }
}

/**
 * 自旋获取锁并执行临界区。
 * @param key       锁键
 * @param fn        临界区
 * @param ttlMs     锁过期时间（防止死锁）
 * @param maxWaitMs 最长等待时间，超过则抛 LockError
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 3000,
  maxWaitMs = 800
): Promise<T> {
  const deadline = Date.now() + maxWaitMs;
  let token: string | null = null;
  let backoff = 8;
  while (token === null) {
    token = await acquire(key, ttlMs);
    if (token) break;
    if (Date.now() >= deadline) throw new LockError();
    await sleep(backoff + Math.floor(Math.random() * 8)); // 抖动避免惊群
    backoff = Math.min(backoff * 2, 64);
  }
  try {
    return await fn();
  } finally {
    await release(key, token);
  }
}
