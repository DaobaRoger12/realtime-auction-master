/**
 * WebSocket 消息契约。
 * 统一信封：{ e: 事件名, d: 负载, ts: 服务器时间戳(ms) }
 * ts 用于客户端「对时」，让倒计时精确到毫秒、不受本地时钟漂移影响。
 */
import { WsClientEvent, WsServerEvent, BidRejectReason } from './enums.js';
import type { Auction, RankingEntry } from './models.js';

export interface WsEnvelope<E extends string, D> {
  e: E;
  d: D;
  /** 服务器时间戳(ms)，仅服务端下行消息携带 */
  ts?: number;
}

/* ----------------------------- 客户端 → 服务端 ----------------------------- */

export interface JoinPayload {
  auctionId: number;
}
export interface LeavePayload {
  auctionId: number;
}
export interface BidPayload {
  auctionId: number;
  /** 出价金额（分） */
  amount: number;
  /** 客户端幂等 ID（如 uuid），用于去重 */
  requestId: string;
}
export interface QuickBidPayload {
  auctionId: number;
  requestId: string;
}
export interface PingPayload {
  /** 客户端发出的时间，用于估算 RTT */
  t: number;
}

export type ClientMessage =
  | WsEnvelope<WsClientEvent.JOIN, JoinPayload>
  | WsEnvelope<WsClientEvent.LEAVE, LeavePayload>
  | WsEnvelope<WsClientEvent.BID, BidPayload>
  | WsEnvelope<WsClientEvent.QUICK_BID, QuickBidPayload>
  | WsEnvelope<WsClientEvent.PING, PingPayload>;

/* ----------------------------- 服务端 → 客户端 ----------------------------- */

export interface WelcomePayload {
  /** 当前连接分配的 sessionId */
  sessionId: string;
  serverTime: number;
}

/** 加入房间后的全量快照 */
export interface SnapshotPayload {
  auction: Auction;
  ranking: RankingEntry[];
  /** 我在本场的最高出价（分），未出价为 null */
  myBestAmount: number | null;
  /** 我是否当前领先 */
  iAmLeading: boolean;
  onlineCount: number;
}

/** 一次成功出价的广播 */
export interface BidAcceptedPayload {
  auctionId: number;
  bidId: number;
  userId: number;
  nickname: string;
  amount: number;
  currentPrice: number;
  bidCount: number;
  participantCount: number;
  version: number;
  /** 最新结束时间（若同时触发延时会变化） */
  endAt: string;
  /** 实时排行榜（Top N） */
  ranking: RankingEntry[];
  /** 领先者 id，便于前端判断「领先/被超越」 */
  leaderId: number;
}

export interface BidRejectedPayload {
  auctionId: number;
  requestId: string;
  reason: BidRejectReason;
  message: string;
  /** 当前最低应价（分），便于前端纠正 */
  minNextBid: number;
  currentPrice: number;
}

export interface AuctionDelayedPayload {
  auctionId: number;
  endAt: string;
  delayCount: number;
  addedSec: number;
}

export interface AuctionStartedPayload {
  auctionId: number;
  endAt: string;
}

export interface AuctionEndedPayload {
  auctionId: number;
  result: 'SOLD' | 'UNSOLD';
  reason: 'TIME_UP' | 'CAP_REACHED' | 'MANUAL';
  winnerId: number | null;
  winnerNickname: string | null;
  finalPrice: number | null;
  orderNo: string | null;
}

export interface AuctionCanceledPayload {
  auctionId: number;
  reason: string;
}

export interface PresencePayload {
  auctionId: number;
  onlineCount: number;
  participantCount: number;
}

export interface PongPayload {
  /** 回显客户端时间 */
  t: number;
  serverTime: number;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export type ServerMessage =
  | WsEnvelope<WsServerEvent.WELCOME, WelcomePayload>
  | WsEnvelope<WsServerEvent.SNAPSHOT, SnapshotPayload>
  | WsEnvelope<WsServerEvent.BID_ACCEPTED, BidAcceptedPayload>
  | WsEnvelope<WsServerEvent.BID_REJECTED, BidRejectedPayload>
  | WsEnvelope<WsServerEvent.AUCTION_DELAYED, AuctionDelayedPayload>
  | WsEnvelope<WsServerEvent.AUCTION_STARTED, AuctionStartedPayload>
  | WsEnvelope<WsServerEvent.AUCTION_ENDED, AuctionEndedPayload>
  | WsEnvelope<WsServerEvent.AUCTION_CANCELED, AuctionCanceledPayload>
  | WsEnvelope<WsServerEvent.PRESENCE, PresencePayload>
  | WsEnvelope<WsServerEvent.PONG, PongPayload>
  | WsEnvelope<WsServerEvent.ERROR, ErrorPayload>;
