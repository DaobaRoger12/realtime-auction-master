/**
 * 出价服务 —— 系统核心链路，保证「绝对不允许一笔出价扣两次钱 / 排名错乱」。
 *
 * 处理管线（层层设防）：
 *   ① 幂等缓存：同一 requestId 直接返回上次结果（防重复提交 / 网络重发）
 *   ② 服务端限流：同用户同场次最小出价间隔（与前端防抖节流呼应）
 *   ③ 分布式锁：按 auctionId 串行化，杜绝并发竞态
 *   ④ 规则校验：起拍价 / 加价幅度 / 封顶价（复用 @auction/shared 纯函数）
 *   ⑤ 数据库事务 + 乐观锁：version 比对失败即冲突回滚（双保险）
 *   ⑥ 封顶自动成交：达到封顶价同事务内结算 + 生成订单
 *   ⑦ 排行榜(ZSET) 更新 + 房间广播(Pub/Sub)
 */
import { redis, RedisKeys } from '../infra/redis.js';
import { withTransaction } from '../infra/mysql.js';
import { auctionRepo } from '../repositories/auctionRepo.js';
import { bidRepo } from '../repositories/bidRepo.js';
import { ranking } from './ranking.js';
import { publishRoom } from './bus.js';
import { withLock, LockError } from './lock.js';
import { performSettlement, type SettleOutcome } from './settlement.js';
import { auctionEngine } from './auctionEngine.js';
import { logger } from '../infra/logger.js';
import {
  BidRejectReason,
  WsServerEvent,
  computeMinNextBid,
  validateBid,
} from '@auction/shared';
import type { BidAcceptedPayload, BidRejectedPayload } from '@auction/shared';

export interface PlaceBidInput {
  auctionId: number;
  userId: number;
  nickname: string;
  amount: number; // 分
  requestId: string;
}

export interface PlaceBidResult {
  ok: boolean;
  /** 失败时返回给出价者本人的拒绝信息 */
  reject?: BidRejectedPayload;
  /** 成功时的广播负载（已发布，附带返回方便调用方） */
  accepted?: BidAcceptedPayload;
  /** 是否因本次出价而成交结束（封顶） */
  ended?: boolean;
}

const REJECT_MESSAGES: Record<BidRejectReason, string> = {
  [BidRejectReason.AUCTION_NOT_FOUND]: '竞拍不存在',
  [BidRejectReason.NOT_LIVE]: '竞拍不在进行中',
  [BidRejectReason.BELOW_MIN]: '出价低于当前最低应价',
  [BidRejectReason.NOT_ON_STEP]: '出价必须按加价幅度递增',
  [BidRejectReason.ABOVE_CAP]: '出价超过封顶价',
  [BidRejectReason.ALREADY_LEADING]: '你已是当前最高出价者',
  [BidRejectReason.CONFLICT]: '出价太火爆，请重试',
  [BidRejectReason.DUPLICATE]: '请勿重复提交',
  [BidRejectReason.RATE_LIMITED]: '手速太快啦，稍后再试',
  [BidRejectReason.UNAUTHORIZED]: '请先登录',
  [BidRejectReason.INTERNAL]: '服务器繁忙，请重试',
};

const IDEM_TTL_SEC = 60;
const RATE_LIMIT_MS = 120; // 同用户最小出价间隔

function reject(
  auctionId: number,
  requestId: string,
  reason: BidRejectReason,
  currentPrice: number,
  minNextBid: number
): PlaceBidResult {
  return {
    ok: false,
    reject: {
      auctionId,
      requestId,
      reason,
      message: REJECT_MESSAGES[reason],
      minNextBid,
      currentPrice,
    },
  };
}

export const bidService = {
  async placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
    const { auctionId, userId, nickname, amount, requestId } = input;

    // ① 幂等：命中缓存直接返回上次结果
    const idemKey = RedisKeys.bidIdempotency(requestId);
    const cached = await redis.get(idemKey);
    if (cached) {
      try {
        return JSON.parse(cached) as PlaceBidResult;
      } catch {
        /* fallthrough */
      }
    }

    // ② 限流（防抖/节流）：同用户同场次最小间隔
    const rateKey = RedisKeys.bidRate(auctionId, userId);
    const gotSlot = await redis.set(rateKey, '1', 'PX', RATE_LIMIT_MS, 'NX');
    if (gotSlot !== 'OK') {
      const a = await auctionRepo.findById(auctionId);
      return reject(
        auctionId,
        requestId,
        BidRejectReason.RATE_LIMITED,
        a?.currentPrice ?? 0,
        a ? computeMinNextBid(a.currentPrice, a.rules) : 0
      );
    }

    try {
      // ③ 分布式锁：按竞拍串行
      const result = await withLock(
        RedisKeys.bidLock(auctionId),
        () => this.process(input),
        3000,
        800
      );
      // 缓存结果用于幂等
      await redis.set(idemKey, JSON.stringify(result), 'EX', IDEM_TTL_SEC);
      return result;
    } catch (err) {
      if (err instanceof LockError) {
        const a = await auctionRepo.findById(auctionId);
        return reject(
          auctionId,
          requestId,
          BidRejectReason.CONFLICT,
          a?.currentPrice ?? 0,
          a ? computeMinNextBid(a.currentPrice, a.rules) : 0
        );
      }
      logger.error({ err: (err as Error).message, auctionId }, 'placeBid 异常');
      const a = await auctionRepo.findById(auctionId);
      return reject(
        auctionId,
        requestId,
        BidRejectReason.INTERNAL,
        a?.currentPrice ?? 0,
        a ? computeMinNextBid(a.currentPrice, a.rules) : 0
      );
    }
  },

  /** 临界区内的实际处理（已持有锁） */
  async process(input: PlaceBidInput): Promise<PlaceBidResult> {
    const { auctionId, userId, nickname, amount, requestId } = input;

    const auction = await auctionRepo.findById(auctionId);
    if (!auction) {
      return reject(auctionId, requestId, BidRejectReason.AUCTION_NOT_FOUND, 0, 0);
    }

    const minNext = computeMinNextBid(auction.currentPrice, auction.rules);

    // ④ 规则校验
    const v = validateBid(
      amount,
      {
        status: auction.status,
        rules: auction.rules,
        currentPrice: auction.currentPrice,
        bidCount: auction.bidCount,
        leaderId: auction.leaderId,
      },
      userId
    );
    if (!v.ok) {
      return reject(auctionId, requestId, v.reason!, auction.currentPrice, minNext);
    }

    // 防狙击：结束前窗口内出价 → 延时
    const nowMs = Date.now();
    const endMs = new Date(auction.endAt).getTime();
    const withinWindow = endMs - nowMs <= auction.rules.antiSnipeWindowSec * 1000;
    const canDelay =
      withinWindow && auction.delayCount < auction.rules.maxDelayTimes && !v.reachesCap;
    const newEndAt = canDelay ? new Date(nowMs + auction.rules.delaySec * 1000) : undefined;

    // 参与人数：该用户此前是否出过价
    const prevBest = await ranking.userBest(auctionId, userId);
    const isNewUser = prevBest == null;
    const participantCount = auction.participantCount + (isNewUser ? 1 : 0);

    // ⑤⑥ 事务：写流水 + 乐观锁更新（+ 封顶成交）
    let settled: SettleOutcome | null = null;
    let bidId = 0;
    try {
      // 事务返回封顶结算结果（从闭包外读取，避免 TS 闭包窄化问题）
      settled = await withTransaction<SettleOutcome | null>(async (conn) => {
        bidId = await bidRepo.insert(conn, {
          auctionId,
          userId,
          nickname,
          amount,
          requestId,
        });

        const ok = await auctionRepo.applyBidOptimistic(conn, {
          id: auctionId,
          expectedVersion: auction.version,
          newPrice: amount,
          leaderId: userId,
          leaderNickname: nickname,
          participantCount,
          newEndAt,
          delayInc: canDelay ? 1 : 0,
        });
        if (!ok) {
          // 乐观锁冲突：回滚
          throw new OptimisticConflict();
        }

        if (v.reachesCap) {
          const product = await auctionRepo.findByIdWithProduct(auctionId);
          return performSettlement(conn, {
            auctionId,
            productId: auction.productId,
            productTitle: product?.product.title ?? '商品',
            productImage: product?.product.image ?? null,
            merchantId: auction.merchantId,
            reason: 'CAP_REACHED',
            winnerId: userId,
            winnerNickname: nickname,
            finalPrice: amount,
          });
        }
        return null;
      });
    } catch (err: any) {
      if (err instanceof OptimisticConflict) {
        return reject(auctionId, requestId, BidRejectReason.CONFLICT, auction.currentPrice, minNext);
      }
      if (err?.code === 'ER_DUP_ENTRY') {
        return reject(auctionId, requestId, BidRejectReason.DUPLICATE, auction.currentPrice, minNext);
      }
      throw err;
    }

    // ⑦ 排行榜 + 广播
    await ranking.record(auctionId, userId, { nickname, avatar: null }, amount);
    const top = await ranking.top(auctionId, 10);

    const effectiveEndAt = (newEndAt ?? new Date(auction.endAt)).toISOString();
    const accepted: BidAcceptedPayload = {
      auctionId,
      bidId,
      userId,
      nickname,
      amount,
      currentPrice: amount,
      bidCount: auction.bidCount + 1,
      participantCount,
      version: auction.version + 1,
      endAt: effectiveEndAt,
      ranking: top,
      leaderId: userId,
    };
    await publishRoom(auctionId, { e: WsServerEvent.BID_ACCEPTED, d: accepted });

    // 延时广播 + 重排定时器
    if (canDelay && newEndAt) {
      auctionEngine.rescheduleEnd(auctionId, newEndAt.getTime());
      await publishRoom(auctionId, {
        e: WsServerEvent.AUCTION_DELAYED,
        d: {
          auctionId,
          endAt: newEndAt.toISOString(),
          delayCount: auction.delayCount + 1,
          addedSec: auction.rules.delaySec,
        },
      });
    }

    // 封顶成交广播
    if (v.reachesCap && settled) {
      auctionEngine.onSettledExternally(auctionId);
      await publishRoom(auctionId, {
        e: WsServerEvent.AUCTION_ENDED,
        d: {
          auctionId,
          result: 'SOLD',
          reason: 'CAP_REACHED',
          winnerId: userId,
          winnerNickname: nickname,
          finalPrice: amount,
          orderNo: settled.orderNo,
        },
      });
    }

    return { ok: true, accepted, ended: v.reachesCap };
  },
};

class OptimisticConflict extends Error {}
