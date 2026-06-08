/**
 * 数据库行 → 领域模型 的映射。集中处理日期 ISO 化、规则对象组装。
 */
import type {
  Auction,
  AuctionResult,
  AuctionStatus,
  Bid,
  Order,
  OrderStatus,
  Product,
  SettleReason,
  User,
  UserRole,
} from '@auction/shared';

const iso = (v: Date | string | null): string | null =>
  v == null ? null : new Date(v).toISOString();
const isoReq = (v: Date | string): string => new Date(v).toISOString();

export function rowToUser(r: any): User {
  return {
    id: Number(r.id),
    username: r.username,
    nickname: r.nickname,
    avatar: r.avatar ?? null,
    role: r.role as UserRole,
    createdAt: isoReq(r.created_at),
  };
}

export function rowToProduct(r: any): Product {
  return {
    id: Number(r.id),
    merchantId: Number(r.merchant_id),
    title: r.title,
    image: r.image ?? null,
    description: r.description,
    category: r.category,
    createdAt: isoReq(r.created_at),
    updatedAt: isoReq(r.updated_at),
  };
}

export function rowToAuction(r: any): Auction {
  return {
    id: Number(r.id),
    productId: Number(r.product_id),
    merchantId: Number(r.merchant_id),
    status: r.status as AuctionStatus,
    result: (r.result ?? null) as AuctionResult | null,
    settleReason: (r.settle_reason ?? null) as SettleReason | null,
    rules: {
      startPrice: Number(r.start_price),
      bidIncrement: Number(r.bid_increment),
      capPrice: r.cap_price == null ? null : Number(r.cap_price),
      durationSec: Number(r.duration_sec),
      antiSnipeWindowSec: Number(r.anti_snipe_window_sec),
      delaySec: Number(r.delay_sec),
      maxDelayTimes: Number(r.max_delay_times),
    },
    currentPrice: Number(r.current_price),
    leaderId: r.leader_id == null ? null : Number(r.leader_id),
    leaderNickname: r.leader_nickname ?? null,
    bidCount: Number(r.bid_count),
    participantCount: Number(r.participant_count),
    delayCount: Number(r.delay_count),
    version: Number(r.version),
    startAt: isoReq(r.start_at),
    endAt: isoReq(r.end_at),
    endedAt: iso(r.ended_at),
    winnerId: r.winner_id == null ? null : Number(r.winner_id),
    winnerNickname: r.winner_nickname ?? null,
    finalPrice: r.final_price == null ? null : Number(r.final_price),
    createdAt: isoReq(r.created_at),
    updatedAt: isoReq(r.updated_at),
  };
}

export function rowToBid(r: any): Bid {
  return {
    id: Number(r.id),
    auctionId: Number(r.auction_id),
    userId: Number(r.user_id),
    nickname: r.nickname,
    amount: Number(r.amount),
    requestId: r.request_id,
    createdAt: isoReq(r.created_at),
  };
}

export function rowToOrder(r: any): Order {
  return {
    id: Number(r.id),
    orderNo: r.order_no,
    auctionId: Number(r.auction_id),
    productId: Number(r.product_id),
    productTitle: r.product_title,
    productImage: r.product_image ?? null,
    buyerId: Number(r.buyer_id),
    buyerNickname: r.buyer_nickname,
    merchantId: Number(r.merchant_id),
    amount: Number(r.amount),
    status: r.status as OrderStatus,
    createdAt: isoReq(r.created_at),
    paidAt: iso(r.paid_at),
  };
}
