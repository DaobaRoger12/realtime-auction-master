/**
 * 竞拍引擎 —— 状态机的「时间维度」管理者。
 *
 * 职责：
 *   1. 维护每场 LIVE 竞拍的结束定时器（精确到 endAt）；
 *   2. 自动开拍（PENDING → LIVE，到达 startAt）；
 *   3. 到时自动成交 / 流拍（TIME_UP）；
 *   4. 出价触发延时后，重排结束定时器；
 *   5. 服务重启后从 DB 恢复全部 LIVE 场次（重建排行榜 + 定时器）。
 *
 * 出价路径中的「封顶成交」由 bidService 在事务内完成后回调 onSettledExternally，
 * 引擎只负责清理定时器，避免重复结算。
 */
import { withTransaction } from '../infra/mysql.js';
import { auctionRepo } from '../repositories/auctionRepo.js';
import { ranking } from './ranking.js';
import { publishRoom } from './bus.js';
import { performSettlement } from './settlement.js';
import { logger } from '../infra/logger.js';
import { WsServerEvent } from '@auction/shared';
import type { AuctionEndedPayload } from '@auction/shared';

class AuctionEngine {
  /** 结束定时器 */
  private endTimers = new Map<number, NodeJS.Timeout>();
  /** 开拍定时器 */
  private startTimers = new Map<number, NodeJS.Timeout>();
  private sweepTimer?: NodeJS.Timeout;

  /** 服务启动时调用：恢复所有进行中/待开始的竞拍 */
  async bootstrap(): Promise<void> {
    const live = await auctionRepo.findAllLive();
    for (const a of live) {
      await ranking.rebuildFromDb(a.id);
      this.scheduleEnd(a.id, new Date(a.endAt).getTime());
    }
    const pending = await auctionRepo.findPendingDue();
    for (const a of pending) await this.startAuction(a.id);

    // 兜底巡检：每 3s 扫描到点未开拍的 PENDING 场次
    this.sweepTimer = setInterval(() => void this.sweepPending(), 3000);
    logger.info(
      { live: live.length, pending: pending.length },
      '🚀 竞拍引擎已启动并恢复定时器'
    );
  }

  shutdown(): void {
    for (const t of this.endTimers.values()) clearTimeout(t);
    for (const t of this.startTimers.values()) clearTimeout(t);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.endTimers.clear();
    this.startTimers.clear();
  }

  /** 为新创建的 PENDING 竞拍安排（开拍 + 结束）定时器 */
  schedulePending(auctionId: number, startAtMs: number): void {
    const delay = Math.max(0, startAtMs - Date.now());
    const existing = this.startTimers.get(auctionId);
    if (existing) clearTimeout(existing);
    // setTimeout 上限约 24.8 天，超出则交给 sweep 巡检兜底
    if (delay > 2_000_000_000) return;
    this.startTimers.set(
      auctionId,
      setTimeout(() => void this.startAuction(auctionId), delay)
    );
  }

  private async sweepPending(): Promise<void> {
    try {
      const due = await auctionRepo.findPendingDue();
      for (const a of due) await this.startAuction(a.id);
    } catch (err: any) {
      logger.error({ err: err?.message }, 'sweepPending 失败');
    }
  }

  /** PENDING → LIVE */
  async startAuction(auctionId: number): Promise<void> {
    const a = await auctionRepo.findById(auctionId);
    if (!a || a.status !== 'PENDING') return;
    const endAt = new Date(Date.now() + a.rules.durationSec * 1000);
    const ok = await auctionRepo.start(auctionId, endAt);
    if (!ok) return;

    const st = this.startTimers.get(auctionId);
    if (st) {
      clearTimeout(st);
      this.startTimers.delete(auctionId);
    }
    this.scheduleEnd(auctionId, endAt.getTime());

    await publishRoom(auctionId, {
      e: WsServerEvent.AUCTION_STARTED,
      d: { auctionId, endAt: endAt.toISOString() },
    });
    logger.info({ auctionId, endAt: endAt.toISOString() }, '▶️  竞拍开始');
  }

  /** 安排/重排结束定时器 */
  scheduleEnd(auctionId: number, endAtMs: number): void {
    const existing = this.endTimers.get(auctionId);
    if (existing) clearTimeout(existing);
    const delay = Math.max(0, endAtMs - Date.now());
    this.endTimers.set(
      auctionId,
      setTimeout(() => void this.settleByTime(auctionId), delay)
    );
  }

  /** 出价触发延时：重排结束定时器 */
  rescheduleEnd(auctionId: number, newEndAtMs: number): void {
    this.scheduleEnd(auctionId, newEndAtMs);
  }

  /** 外部（封顶成交/取消）已结束：仅清理定时器 */
  onSettledExternally(auctionId: number): void {
    const t = this.endTimers.get(auctionId);
    if (t) {
      clearTimeout(t);
      this.endTimers.delete(auctionId);
    }
  }

  /** 到时结算（成交 / 流拍） */
  async settleByTime(auctionId: number): Promise<void> {
    this.endTimers.delete(auctionId);
    try {
      const a = await auctionRepo.findByIdWithProduct(auctionId);
      if (!a || a.status !== 'LIVE') return;

      // 防御：若因延时使 endAt 又被推后，重新排程而非结算
      const endMs = new Date(a.endAt).getTime();
      if (endMs - Date.now() > 250) {
        this.scheduleEnd(auctionId, endMs);
        return;
      }

      const sold = a.leaderId != null && a.bidCount > 0;
      const outcome = await withTransaction((conn) =>
        performSettlement(conn, {
          auctionId: a.id,
          productId: a.productId,
          productTitle: a.product.title,
          productImage: a.product.image,
          merchantId: a.merchantId,
          reason: 'TIME_UP',
          winnerId: sold ? a.leaderId : null,
          winnerNickname: sold ? a.leaderNickname : null,
          finalPrice: sold ? a.currentPrice : null,
        })
      );

      const payload: AuctionEndedPayload = {
        auctionId: a.id,
        result: outcome.result,
        reason: 'TIME_UP',
        winnerId: sold ? a.leaderId : null,
        winnerNickname: sold ? a.leaderNickname : null,
        finalPrice: sold ? a.currentPrice : null,
        orderNo: outcome.orderNo,
      };
      await publishRoom(auctionId, { e: WsServerEvent.AUCTION_ENDED, d: payload });
      logger.info({ auctionId, result: outcome.result }, '⏹️  竞拍到时结束');
    } catch (err: any) {
      logger.error({ err: err?.message, auctionId }, 'settleByTime 失败');
    }
  }

  /** 主播取消：广播 + 清理（DB 状态由路由层已置为 CANCELED） */
  async onCanceled(auctionId: number, reason: string): Promise<void> {
    this.onSettledExternally(auctionId);
    const st = this.startTimers.get(auctionId);
    if (st) {
      clearTimeout(st);
      this.startTimers.delete(auctionId);
    }
    await publishRoom(auctionId, {
      e: WsServerEvent.AUCTION_CANCELED,
      d: { auctionId, reason },
    });
  }
}

export const auctionEngine = new AuctionEngine();
