/**
 * 领域模型（与数据库表对应的对外 DTO 形态）。
 * 金额统一以「分」为单位的整数存储与传输，避免浮点误差；前端展示时再 /100。
 */
import type {
  AuctionResult,
  AuctionStatus,
  OrderStatus,
  SettleReason,
  UserRole,
} from './enums.js';

export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  role: UserRole;
  createdAt: string;
}

export interface Product {
  id: number;
  merchantId: number;
  title: string;
  /** 商品图片（封面） */
  image: string | null;
  /** 富文本 / 多段介绍 */
  description: string;
  /** 商品分类，如 珠宝 / 艺术品 / 二手奢侈品 */
  category: string;
  createdAt: string;
  updatedAt: string;
}

/** 竞拍规则（创建时配置，开拍前可改） */
export interface AuctionRules {
  /** 起拍价（分）。支持 0 元起拍 */
  startPrice: number;
  /** 加价幅度（分），每次出价必须为该值整数倍递增 */
  bidIncrement: number;
  /** 封顶价（分）。null 表示不封顶 */
  capPrice: number | null;
  /** 竞拍时长（秒） */
  durationSec: number;
  /** 防狙击：结束前该窗口内有出价则触发延时（秒） */
  antiSnipeWindowSec: number;
  /** 每次延时增加的秒数（题目要求 10~30 秒） */
  delaySec: number;
  /** 单场最多延时次数（防止无限延时） */
  maxDelayTimes: number;
}

export interface Auction {
  id: number;
  productId: number;
  merchantId: number;
  status: AuctionStatus;
  result: AuctionResult | null;
  settleReason: SettleReason | null;

  rules: AuctionRules;

  /** 当前价（分）。无人出价时等于起拍价 */
  currentPrice: number;
  /** 当前最高出价者 */
  leaderId: number | null;
  leaderNickname: string | null;
  /** 出价总次数 */
  bidCount: number;
  /** 参与人数（去重出价人数） */
  participantCount: number;
  /** 已延时次数 */
  delayCount: number;
  /** 乐观锁版本号 */
  version: number;

  /** 计划开始时间（ISO） */
  startAt: string;
  /** 当前结束时间（可能因延时被推后，ISO） */
  endAt: string;
  /** 实际结束时间 */
  endedAt: string | null;

  /** 中标者（结束后） */
  winnerId: number | null;
  winnerNickname: string | null;
  finalPrice: number | null;

  createdAt: string;
  updatedAt: string;
}

/** 列表/详情中常带上的商品冗余信息 */
export interface AuctionWithProduct extends Auction {
  product: Product;
}

export interface Bid {
  id: number;
  auctionId: number;
  userId: number;
  nickname: string;
  /** 出价金额（分） */
  amount: number;
  /** 客户端幂等 ID */
  requestId: string;
  createdAt: string;
}

/** 排行榜条目（按用户的最高出价排序） */
export interface RankingEntry {
  rank: number;
  userId: number;
  nickname: string;
  avatar: string | null;
  /** 该用户的最高出价（分） */
  bestAmount: number;
  /** 是否为当前领先者 */
  isLeader: boolean;
}

export interface Order {
  id: number;
  orderNo: string;
  auctionId: number;
  productId: number;
  productTitle: string;
  productImage: string | null;
  buyerId: number;
  buyerNickname: string;
  merchantId: number;
  /** 成交价（分） */
  amount: number;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
}
