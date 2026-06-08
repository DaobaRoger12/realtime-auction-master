/**
 * AuctionSocket —— 竞拍 WebSocket 客户端（管理后台实时监播用）。
 * 自动重连 + 心跳 + 服务器对时 + 事件订阅，与移动端同源实现。
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
  private serverOffset = 0;

  constructor(token: string | null) {
    this.token = token;
  }

  connect(): void {
    this.manualClose = false;
    this.open();
  }

  private open(): void {
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    const ws = new WebSocket(`${proto}://${location.host}/ws${qs}`);
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState('open');
      this.startHeartbeat();
      for (const id of this.joinedRooms) this.send(WsClientEvent.JOIN, { auctionId: id });
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onclose = () => {
      this.stopHeartbeat();
      if (this.manualClose) return this.setState('closed');
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

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(
      () => this.send(WsClientEvent.PING, { t: Date.now() }),
      WS_CONFIG.HEARTBEAT_INTERVAL
    );
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
    if (typeof msg.ts === 'number') this.serverOffset = msg.ts - Date.now();
    if (msg.e === WsServerEvent.WELCOME || msg.e === WsServerEvent.PONG) {
      const d: any = msg.d;
      if (d.serverTime) this.serverOffset = d.serverTime - Date.now();
    }
    this.emit(msg.e, msg.d, msg);
  }

  serverNow(): number {
    return Date.now() + this.serverOffset;
  }

  join(auctionId: number): void {
    this.joinedRooms.add(auctionId);
    this.send(WsClientEvent.JOIN, { auctionId });
  }
  leave(auctionId: number): void {
    this.joinedRooms.delete(auctionId);
    this.send(WsClientEvent.LEAVE, { auctionId });
  }

  private send(e: WsClientEvent, d: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ e, d }));
  }

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
