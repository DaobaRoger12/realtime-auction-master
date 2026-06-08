/**
 * 竞拍规则的纯函数实现 —— 前后端共用同一套逻辑。
 *
 * 设计原则：
 *  1. 服务端为唯一权威，前端调用这些函数只为「即时 UX 反馈」，最终以服务端结果为准；
 *  2. 所有金额以「分」为单位的整数运算，杜绝浮点误差；
 *  3. 出价网格：合法出价为 startPrice + k * bidIncrement (k>=1)，即「按固定幅度递增」；
 *  4. 封顶价：允许一口出到封顶价直接成交（即使不落在加价网格上）。
 */
import { BidRejectReason } from './enums.js';
import type { AuctionRules } from './models.js';

/** 出价校验所需的竞拍快照（最小集合） */
export interface BidContext {
  status: 'PENDING' | 'LIVE' | 'ENDED' | 'CANCELED';
  rules: AuctionRules;
  currentPrice: number;
  /** 当前是否已有出价（用于首拍判断，可选） */
  bidCount?: number;
  /** 当前领先者，用于「已领先」判断 */
  leaderId?: number | null;
}

export interface BidValidation {
  ok: boolean;
  reason?: BidRejectReason;
  /** 该出价是否达到封顶价（命中则触发自动成交） */
  reachesCap: boolean;
}

/** 当前最低应价（分）：当前价 + 一个加价幅度 */
export function computeMinNextBid(currentPrice: number, rules: AuctionRules): number {
  const next = currentPrice + rules.bidIncrement;
  if (rules.capPrice != null) return Math.min(next, rules.capPrice);
  return next;
}

/**
 * 一键加价金额：默认出到最低应价；
 * 若最低应价已达/超过封顶价，则出到封顶价。
 */
export function computeQuickBidAmount(currentPrice: number, rules: AuctionRules): number {
  return computeMinNextBid(currentPrice, rules);
}

/**
 * 核心出价校验。返回是否通过 + 拒绝原因 + 是否触发封顶成交。
 * @param amount   出价金额（分）
 * @param ctx      竞拍上下文
 * @param userId   出价用户（用于「已领先」判断，可选）
 */
export function validateBid(
  amount: number,
  ctx: BidContext,
  userId?: number
): BidValidation {
  const { rules, currentPrice } = ctx;

  if (ctx.status !== 'LIVE') {
    return { ok: false, reason: BidRejectReason.NOT_LIVE, reachesCap: false };
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, reason: BidRejectReason.BELOW_MIN, reachesCap: false };
  }
  if (userId != null && ctx.leaderId != null && userId === ctx.leaderId) {
    return { ok: false, reason: BidRejectReason.ALREADY_LEADING, reachesCap: false };
  }

  const cap = rules.capPrice;
  if (cap != null && amount > cap) {
    return { ok: false, reason: BidRejectReason.ABOVE_CAP, reachesCap: false };
  }

  const minNext = currentPrice + rules.bidIncrement;
  // 允许一口出到封顶价直接成交（即使不在加价网格上）
  const isCapBid = cap != null && amount === cap;

  if (amount < minNext && !isCapBid) {
    return { ok: false, reason: BidRejectReason.BELOW_MIN, reachesCap: false };
  }

  if (!isCapBid) {
    const onStep = (amount - rules.startPrice) % rules.bidIncrement === 0;
    if (!onStep) {
      return { ok: false, reason: BidRejectReason.NOT_ON_STEP, reachesCap: false };
    }
  }

  const reachesCap = cap != null && amount >= cap;
  return { ok: true, reachesCap };
}

/** 校验规则配置是否合法（创建/修改竞拍时用） */
export function validateRules(rules: Partial<AuctionRules>): string[] {
  const errors: string[] = [];
  const {
    startPrice,
    bidIncrement,
    capPrice,
    durationSec,
    antiSnipeWindowSec,
    delaySec,
    maxDelayTimes,
  } = rules;

  if (startPrice == null || startPrice < 0) errors.push('起拍价不能为负');
  if (bidIncrement == null || bidIncrement <= 0) errors.push('加价幅度必须大于 0');
  if (capPrice != null && startPrice != null && capPrice <= startPrice) {
    errors.push('封顶价必须大于起拍价');
  }
  if (durationSec == null || durationSec < 10) errors.push('竞拍时长至少 10 秒');
  if (antiSnipeWindowSec == null || antiSnipeWindowSec < 0) {
    errors.push('防狙击窗口不能为负');
  }
  if (delaySec == null || delaySec < 5 || delaySec > 60) {
    errors.push('单次延时建议在 5~60 秒之间（题目推荐 10~30 秒）');
  }
  if (maxDelayTimes == null || maxDelayTimes < 0) errors.push('最大延时次数不能为负');
  return errors;
}

/* ----------------------------- 金额工具 ----------------------------- */

/** 分 → 元（数值） */
export function fenToYuan(fen: number): number {
  return Math.round(fen) / 100;
}

/** 元 → 分（整数） */
export function yuanToFen(yuan: number): number {
  return Math.round(yuan * 100);
}

/** 分 → 人民币展示字符串，如 ¥1,280.00 */
export function formatMoney(fen: number, withSymbol = true): string {
  const yuan = fenToYuan(fen);
  const s = yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `¥${s}` : s;
}
