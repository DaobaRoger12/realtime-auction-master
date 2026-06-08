/**
 * 房间级事件总线（Redis Pub/Sub）。
 *
 * 出价/延时/结束等需要广播给「房间内所有人」的事件，统一发布到
 * room:{auctionId} 频道；每个服务实例的 WS Hub 订阅后投递给本地连接。
 * 这样即使横向扩展多实例，单个直播间的消息也能精确路由、互不串台，
 * 是「WebSocket 房间级路由隔离 + 1000+ 同时在线」的基础设施。
 */
import { redis, RedisKeys } from '../infra/redis.js';
import type { ServerMessage } from '@auction/shared';

/** 把消息广播到某竞拍房间（跨实例） */
export async function publishRoom(auctionId: number, msg: ServerMessage): Promise<void> {
  msg.ts = Date.now();
  await redis.publish(RedisKeys.roomChannel(auctionId), JSON.stringify(msg));
}

/** 从频道名解析出 auctionId（room:123 → 123） */
export function auctionIdFromChannel(channel: string): number | null {
  const m = /^room:(\d+)$/.exec(channel);
  return m ? Number(m[1]) : null;
}
