/**
 * @auction/shared —— 前后端共享契约。
 */
export * from './enums.js';
export * from './models.js';
export * from './rules.js';
export * from './events.js';
export * from './dto.js';

/** WebSocket 默认参数（前后端共用，避免心跳/超时配置不一致） */
export const WS_CONFIG = {
  /** 客户端心跳间隔(ms) */
  HEARTBEAT_INTERVAL: 15_000,
  /** 服务端判定超时(ms)：超过则视为断连 */
  HEARTBEAT_TIMEOUT: 40_000,
  /** 客户端重连基础退避(ms) */
  RECONNECT_BASE_DELAY: 500,
  /** 客户端重连最大退避(ms) */
  RECONNECT_MAX_DELAY: 10_000,
} as const;
