/**
 * 全局枚举：状态机、角色、出价拒绝原因、WebSocket 事件名。
 * 前后端共享，保证状态流转与协议一致。
 */

/** 竞拍状态机
 *  PENDING ──(到达开始时间/主播开拍)──▶ LIVE ──(到时间/达封顶价)──▶ ENDED
 *     │                                   │
 *     └──────────(主播取消)───────────────┴──────────▶ CANCELED
 */
export enum AuctionStatus {
  /** 未开始 */
  PENDING = 'PENDING',
  /** 进行中 */
  LIVE = 'LIVE',
  /** 已结束（成交或流拍） */
  ENDED = 'ENDED',
  /** 已取消（主播取消异常竞拍） */
  CANCELED = 'CANCELED',
}

/** 竞拍最终结果（仅在 ENDED / CANCELED 时有意义） */
export enum AuctionResult {
  /** 成交 */
  SOLD = 'SOLD',
  /** 流拍（无人出价或未达条件） */
  UNSOLD = 'UNSOLD',
  /** 取消 */
  CANCELED = 'CANCELED',
}

/** 成交原因，便于前端展示与复盘 */
export enum SettleReason {
  /** 倒计时自然结束 */
  TIME_UP = 'TIME_UP',
  /** 达到封顶价自动成交 */
  CAP_REACHED = 'CAP_REACHED',
  /** 主播手动结束 */
  MANUAL = 'MANUAL',
}

/** 订单状态机 */
export enum OrderStatus {
  /** 待支付 */
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  /** 已支付 */
  PAID = 'PAID',
  /** 已取消 */
  CANCELED = 'CANCELED',
}

/** 用户角色 */
export enum UserRole {
  /** 商家 / 主播（管理后台） */
  MERCHANT = 'MERCHANT',
  /** 普通买家（移动端） */
  BUYER = 'BUYER',
}

/** 出价被拒原因（服务端校验失败时返回，前端做精准提示） */
export enum BidRejectReason {
  AUCTION_NOT_FOUND = 'AUCTION_NOT_FOUND',
  /** 竞拍未在进行中 */
  NOT_LIVE = 'NOT_LIVE',
  /** 出价低于当前最低应价 */
  BELOW_MIN = 'BELOW_MIN',
  /** 未按加价幅度的整数倍出价 */
  NOT_ON_STEP = 'NOT_ON_STEP',
  /** 超过封顶价 */
  ABOVE_CAP = 'ABOVE_CAP',
  /** 你已是当前最高出价者，无需重复出价 */
  ALREADY_LEADING = 'ALREADY_LEADING',
  /** 并发冲突（乐观锁失败），请重试 */
  CONFLICT = 'CONFLICT',
  /** 重复请求（幂等拦截） */
  DUPLICATE = 'DUPLICATE',
  /** 触发限流 / 防抖 */
  RATE_LIMITED = 'RATE_LIMITED',
  /** 未登录 / 无权限 */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** 服务器内部错误 */
  INTERNAL = 'INTERNAL',
}

/** 客户端 → 服务端 的 WebSocket 事件名 */
export enum WsClientEvent {
  /** 加入竞拍房间 */
  JOIN = 'join',
  /** 离开房间 */
  LEAVE = 'leave',
  /** 出价 */
  BID = 'bid',
  /** 一键加价（按当前最低应价出价） */
  QUICK_BID = 'quick_bid',
  /** 心跳 */
  PING = 'ping',
}

/** 服务端 → 客户端 的 WebSocket 事件名 */
export enum WsServerEvent {
  /** 连接建立后的握手信息（含服务器时间，用于对时） */
  WELCOME = 'welcome',
  /** 加入房间后的全量快照 */
  SNAPSHOT = 'snapshot',
  /** 出价被接受并广播（房间内所有人） */
  BID_ACCEPTED = 'bid_accepted',
  /** 出价被拒（仅发给出价者本人） */
  BID_REJECTED = 'bid_rejected',
  /** 自动延时（防狙击） */
  AUCTION_DELAYED = 'auction_delayed',
  /** 竞拍开始 */
  AUCTION_STARTED = 'auction_started',
  /** 竞拍结束（成交 / 流拍） */
  AUCTION_ENDED = 'auction_ended',
  /** 竞拍取消 */
  AUCTION_CANCELED = 'auction_canceled',
  /** 在线人数 / 参与人数变化 */
  PRESENCE = 'presence',
  /** 心跳响应 */
  PONG = 'pong',
  /** 通用错误 */
  ERROR = 'error',
}
