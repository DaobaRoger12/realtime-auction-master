/**
 * WebSocket Hub —— 实时通信中枢。
 *
 *  - 连接注册 / 鉴权（JWT 可选，游客可观战，出价需登录）
 *  - 房间路由：一个连接可加入多个竞拍房间，消息按房间精确投递
 *  - 心跳保活：ping/pong + 超时清理，配合前端自动重连
 *  - 跨实例广播：订阅 Redis room:* 频道，把 Pub/Sub 消息投递给本地连接
 *  - 全量快照：加入房间即下发 auction + 排行榜 + 我的状态 + 在线人数
 */
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { redisSub } from '../infra/redis.js';
import { auctionRepo } from '../repositories/auctionRepo.js';
import { ranking } from '../services/ranking.js';
import { presence } from '../services/presence.js';
import { bidService } from '../services/bidService.js';
import { publishRoom, auctionIdFromChannel } from '../services/bus.js';
import { verifyToken } from '../utils/security.js';
import { uuid } from '../utils/helpers.js';
import { logger } from '../infra/logger.js';
import {
  WS_CONFIG,
  WsClientEvent,
  WsServerEvent,
  BidRejectReason,
  computeQuickBidAmount,
} from '@auction/shared';
import type {
  ClientMessage,
  ServerMessage,
  SnapshotPayload,
} from '@auction/shared';

interface ClientConn {
  id: string;
  ws: WebSocket;
  userId: number | null;
  nickname: string;
  rooms: Set<number>;
  isAlive: boolean;
}

/** presence 广播合并窗口(ms) */
const PRESENCE_COALESCE_MS = 400;

class WsHub {
  private conns = new Map<string, ClientConn>();
  /** 本实例内：auctionId → sessionId 集合 */
  private localRooms = new Map<number, Set<string>>();
  /** 房间 → presence 合并广播定时器 */
  private presenceTimers = new Map<number, NodeJS.Timeout>();
  private heartbeatTimer?: NodeJS.Timeout;

  attach(wss: WebSocketServer): void {
    wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.startHeartbeat();
    this.startPubSub();
    logger.info('🔌 WebSocket Hub 已挂载');
  }

  shutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const t of this.presenceTimers.values()) clearTimeout(t);
    this.presenceTimers.clear();
    for (const c of this.conns.values()) c.ws.terminate();
    this.conns.clear();
    this.localRooms.clear();
  }

  /* ----------------------------- 连接生命周期 ----------------------------- */

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const { userId, nickname } = this.authenticate(req);
    const conn: ClientConn = {
      id: uuid(),
      ws,
      userId,
      nickname,
      rooms: new Set(),
      isAlive: true,
    };
    this.conns.set(conn.id, conn);

    this.sendTo(conn, {
      e: WsServerEvent.WELCOME,
      d: { sessionId: conn.id, serverTime: Date.now() },
    });

    ws.on('pong', () => {
      conn.isAlive = true;
    });
    ws.on('message', (raw) => void this.onMessage(conn, raw.toString()));
    ws.on('close', () => void this.onClose(conn));
    ws.on('error', () => void this.onClose(conn));
  }

  private authenticate(req: IncomingMessage): { userId: number | null; nickname: string } {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) return { userId: null, nickname: '游客' };
      const payload = verifyToken(token);
      return { userId: payload.uid, nickname: payload.nickname || payload.username };
    } catch {
      return { userId: null, nickname: '游客' };
    }
  }

  private async onClose(conn: ClientConn): Promise<void> {
    if (!this.conns.has(conn.id)) return;
    this.conns.delete(conn.id);
    for (const auctionId of conn.rooms) {
      this.localRooms.get(auctionId)?.delete(conn.id);
      await presence.leave(auctionId, conn.id);
      this.schedulePresenceBroadcast(auctionId);
    }
  }

  /* ----------------------------- 消息处理 ----------------------------- */

  private async onMessage(conn: ClientConn, raw: string): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      switch (msg.e) {
        case WsClientEvent.PING:
          this.sendTo(conn, {
            e: WsServerEvent.PONG,
            d: { t: msg.d.t, serverTime: Date.now() },
          });
          break;
        case WsClientEvent.JOIN:
          await this.onJoin(conn, msg.d.auctionId);
          break;
        case WsClientEvent.LEAVE:
          await this.onLeave(conn, msg.d.auctionId);
          break;
        case WsClientEvent.BID:
          await this.onBid(conn, msg.d.auctionId, msg.d.amount, msg.d.requestId);
          break;
        case WsClientEvent.QUICK_BID:
          await this.onQuickBid(conn, msg.d.auctionId, msg.d.requestId);
          break;
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, 'WS 消息处理失败');
      this.sendTo(conn, { e: WsServerEvent.ERROR, d: { message: '处理失败' } });
    }
  }

  private async onJoin(conn: ClientConn, auctionId: number): Promise<void> {
    conn.rooms.add(auctionId);
    let set = this.localRooms.get(auctionId);
    if (!set) {
      set = new Set();
      this.localRooms.set(auctionId, set);
    }
    set.add(conn.id);

    const online = await presence.join(auctionId, conn.id);
    await this.sendSnapshot(conn, auctionId, online);
    this.schedulePresenceBroadcast(auctionId);
  }

  private async onLeave(conn: ClientConn, auctionId: number): Promise<void> {
    conn.rooms.delete(auctionId);
    this.localRooms.get(auctionId)?.delete(conn.id);
    await presence.leave(auctionId, conn.id);
    this.schedulePresenceBroadcast(auctionId);
  }

  private async onBid(
    conn: ClientConn,
    auctionId: number,
    amount: number,
    requestId: string
  ): Promise<void> {
    if (conn.userId == null) {
      this.sendTo(conn, {
        e: WsServerEvent.BID_REJECTED,
        d: {
          auctionId,
          requestId,
          reason: BidRejectReason.UNAUTHORIZED,
          message: '请先登录再出价',
          minNextBid: 0,
          currentPrice: 0,
        },
      });
      return;
    }
    const result = await bidService.placeBid({
      auctionId,
      userId: conn.userId,
      nickname: conn.nickname,
      amount,
      requestId,
    });
    // 拒绝信息仅回发给出价者本人；成功的广播已由 bidService 发布
    if (!result.ok && result.reject) {
      this.sendTo(conn, { e: WsServerEvent.BID_REJECTED, d: result.reject });
    }
  }

  private async onQuickBid(
    conn: ClientConn,
    auctionId: number,
    requestId: string
  ): Promise<void> {
    const auction = await auctionRepo.findById(auctionId);
    if (!auction) return;
    const amount = computeQuickBidAmount(auction.currentPrice, auction.rules);
    await this.onBid(conn, auctionId, amount, requestId);
  }

  private async sendSnapshot(
    conn: ClientConn,
    auctionId: number,
    online: number
  ): Promise<void> {
    const auction = await auctionRepo.findByIdWithProduct(auctionId);
    if (!auction) {
      this.sendTo(conn, { e: WsServerEvent.ERROR, d: { message: '竞拍不存在' } });
      return;
    }
    const top = await ranking.top(auctionId, 10);
    const myBest =
      conn.userId != null ? await ranking.userBest(auctionId, conn.userId) : null;
    const payload: SnapshotPayload = {
      auction,
      ranking: top,
      myBestAmount: myBest,
      iAmLeading: conn.userId != null && top[0]?.userId === conn.userId,
      onlineCount: online,
    };
    this.sendTo(conn, { e: WsServerEvent.SNAPSHOT, d: payload });
  }

  /**
   * 在线人数广播「合并节流」：高并发瞬时大量进退房时，
   * 把短时间内的多次 presence 变更合并为一次广播（每房间 ~2.5 次/秒），
   * 将建连风暴的 O(N²) 广播降为 O(N)，显著降低延迟与带宽。
   */
  private schedulePresenceBroadcast(auctionId: number): void {
    if (this.presenceTimers.has(auctionId)) return;
    const timer = setTimeout(async () => {
      this.presenceTimers.delete(auctionId);
      try {
        const [online, participantCount] = await Promise.all([
          presence.count(auctionId),
          ranking.participantCount(auctionId),
        ]);
        await publishRoom(auctionId, {
          e: WsServerEvent.PRESENCE,
          d: { auctionId, onlineCount: online, participantCount },
        });
      } catch (err: any) {
        logger.error({ err: err?.message, auctionId }, 'presence 广播失败');
      }
    }, PRESENCE_COALESCE_MS);
    this.presenceTimers.set(auctionId, timer);
  }

  /* ----------------------------- 跨实例广播 ----------------------------- */

  private startPubSub(): void {
    redisSub.psubscribe('room:*', (err) => {
      if (err) logger.error({ err: err.message }, 'psubscribe room:* 失败');
    });
    redisSub.on('pmessage', (_pattern, channel, message) => {
      const auctionId = auctionIdFromChannel(channel);
      if (auctionId == null) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(message);
      } catch {
        return;
      }
      this.deliverLocal(auctionId, msg);
    });
  }

  /** 投递给本实例该房间内所有连接 */
  private deliverLocal(auctionId: number, msg: ServerMessage): void {
    const set = this.localRooms.get(auctionId);
    if (!set || set.size === 0) return;
    const data = JSON.stringify(msg);
    for (const sid of set) {
      const conn = this.conns.get(sid);
      if (conn && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(data);
      }
    }
  }

  /* ----------------------------- 心跳 ----------------------------- */

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const conn of this.conns.values()) {
        if (!conn.isAlive) {
          conn.ws.terminate();
          continue;
        }
        conn.isAlive = false;
        try {
          conn.ws.ping();
        } catch {
          /* ignore */
        }
      }
    }, WS_CONFIG.HEARTBEAT_INTERVAL);
  }

  private sendTo(conn: ClientConn, msg: ServerMessage): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    msg.ts = msg.ts ?? Date.now();
    conn.ws.send(JSON.stringify(msg));
  }

  /** 当前实例统计（用于 /health 可观测性） */
  stats(): { connections: number; rooms: number } {
    return { connections: this.conns.size, rooms: this.localRooms.size };
  }
}

export const wsHub = new WsHub();
