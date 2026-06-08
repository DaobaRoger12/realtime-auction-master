/**
 * REST API 的请求 / 响应 DTO。
 */
import type { UserRole } from './enums.js';
import type {
  Auction,
  AuctionRules,
  AuctionWithProduct,
  Bid,
  Order,
  Product,
  RankingEntry,
  User,
} from './models.js';

/** 统一响应信封 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ------------------------------- 认证 ------------------------------- */
export interface LoginRequest {
  username: string;
  password: string;
}
export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
  role: UserRole;
}
export interface AuthResponse {
  token: string;
  user: User;
}

/* ------------------------------- 商品 ------------------------------- */
export interface CreateProductRequest {
  title: string;
  image?: string | null;
  description: string;
  category: string;
}
export type UpdateProductRequest = Partial<CreateProductRequest>;

/* ------------------------------- 竞拍 ------------------------------- */
export interface CreateAuctionRequest {
  /** 复用已有商品 */
  productId?: number;
  /** 或同时新建商品 */
  product?: CreateProductRequest;
  rules: AuctionRules;
  /** 计划开始时间（ISO）。不传表示创建后手动开拍 */
  startAt?: string;
}
export interface UpdateAuctionRulesRequest {
  rules?: Partial<AuctionRules>;
  startAt?: string;
}
export interface AuctionListQuery {
  status?: string;
  merchantId?: number;
  page?: number;
  pageSize?: number;
}

export type ProductResponse = Product;
export type AuctionResponse = AuctionWithProduct;
export type AuctionListResponse = Paginated<AuctionWithProduct>;
export type BidListResponse = Paginated<Bid>;
export type OrderListResponse = Paginated<Order>;
export type RankingResponse = RankingEntry[];

/* --------------------------- AI 辅助接口 --------------------------- */
export interface AiDescribeRequest {
  title: string;
  category: string;
  /** 卖点关键词，可选 */
  keywords?: string;
}
export interface AiDescribeResponse {
  title: string;
  description: string;
  /** 推荐起拍价、加价幅度、封顶价（分）等 */
  suggestedRules?: Partial<AuctionRules>;
}

export interface AiCommentaryRequest {
  auctionId: number;
  /** 场景：开场 / 出价 / 临近结束 / 成交 */
  scene: 'open' | 'bid' | 'ending' | 'sold';
  context?: Record<string, unknown>;
}
export interface AiCommentaryResponse {
  text: string;
}

export type { Auction, AuctionRules, AuctionWithProduct, Bid, Order, Product, RankingEntry, User };
