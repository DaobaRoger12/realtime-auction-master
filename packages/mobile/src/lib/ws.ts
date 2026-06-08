/**
 * AuctionSocket —— 竞拍 WebSocket 客户端。
 *
 * 关键能力（对应「毫秒级实时同步」「WebSocket 稳定」挑战）：
 *   - 自动重连：指数退避 + 抖动，断网恢复后自动重连并重新 join 房间
 *   - 心跳保活：定时 PING，配合服务端 ping/pong，及时发现死连接
 *   - 服务器对时：用 welcome / pong 的 serverTime 估算时钟偏移，
 *     使本地倒计时与服务器毫秒对齐，避免「各人看到的结束时间不一致」
 *   - 事件分发：基于事件名的轻量发布订阅
 */
import {
  WS_CONFIG,
  WsClientEvent,
  WsServerEvent,
  type ServerMessage,
} from '@auction/shared';

type Handler = (payload: any, raw: ServerMessage) => void;
export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export class AuctionSocket {
  private ws: WebSocket | null = null;
  private token: string | null;
  private handlers = new Map<string, Set<Handler>>();
  private stateHandlers = new Set<(s: ConnState) => void>();
  private joinedRooms = new Set<number>();
  private reconnectAttempts = 0;
  private heartbeatTimer?: number;
  private reconnectTimer?: number;
  private manualClose = false;

  /** 服务器时间相对本地的偏移(ms)：serverNow ≈ Date.now() + offset */
  private serverOffset = 0;
  private lastRtt = 0;

  constructor(token: string | null) {
    this.token = token;
  }

  /* ----------------------------- 连接管理 ----------------------------- */
  connect(): void {
    this.manualClose = false;
    this.open();
  }

  private open(): void {
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    const url = `${proto}://${location.host}/ws${qs}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState('open');
      this.startHeartbeat();
      // 断线重连后自动重新加入此前的房间
      for (const id of this.joinedRooms) this.send(WsClientEvent.JOIN, { auctionId: id });
    };

    ws.onmessage = (ev) => this.onMessage(ev.data);

    ws.onclose = () => {
      this.stopHeartbeat();
      if (this.manualClose) {
        this.setState('closed');
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    this.reconnectAttempts += 1;
    const base = WS_CONFIG.RECONNECT_BASE_DELAY * 2 ** Math.min(this.reconnectAttempts, 6);
    const delay = Math.min(base, WS_CONFIG.RECONNECT_MAX_DELAY) + Math.random() * 300;
    this.reconnectTimer = window.setTimeout(() => this.open(), delay);
  }

  close(): void {
    this.manualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  /* ----------------------------- 心跳 & 对时 ----------------------------- */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send(WsClientEvent.PING, { t: Date.now() });
    }, WS_CONFIG.HEARTBEAT_INTERVAL);
  }
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  private onMessage(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    // 用消息的 ts 持续校准时钟偏移
    if (typeof msg.ts === 'number') {
      this.serverOffset = msg.ts - Date.now();
    }
    if (msg.e === WsServerEvent.PONG) {
      const d: any = msg.d;
      this.lastRtt = Date.now() - d.t;
      // 用 RTT 的一半补偿单程延迟
      this.serverOffset = d.serverTime + this.lastRtt / 2 - Date.now();
    }
    if (msg.e === WsServerEvent.WELCOME) {
      const d: any = msg.d;
      this.serverOffset = d.serverTime - Date.now();
    }
    this.emit(msg.e, msg.d, msg);
  }

  /** 估算的服务器当前时间(ms) */
  serverNow(): number {
    return Date.now() + this.serverOffset;
  }
  rtt(): number {
    return this.lastRtt;
  }

  /* ----------------------------- 房间 & 出价 ----------------------------- */
  join(auctionId: number): void {
    this.joinedRooms.add(auctionId);
    this.send(WsClientEvent.JOIN, { auctionId });
  }
  leave(auctionId: number): void {
    this.joinedRooms.delete(auctionId);
    this.send(WsClientEvent.LEAVE, { auctionId });
  }
  bid(auctionId: number, amount: number, requestId: string): void {
    this.send(WsClientEvent.BID, { auctionId, amount, requestId });
  }
  quickBid(auctionId: number, requestId: string): void {
    this.send(WsClientEvent.QUICK_BID, { auctionId, requestId });
  }

  private send(e: WsClientEvent, d: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ e, d }));
    }
  }

  /* ----------------------------- 事件订阅 ----------------------------- */
  on(event: WsServerEvent, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  onState(handler: (s: ConnState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  private emit(event: string, payload: any, raw: ServerMessage): void {
    this.handlers.get(event)?.forEach((h) => h(payload, raw));
  }
  private setState(s: ConnState): void {
    this.stateHandlers.forEach((h) => h(s));
  }
}
