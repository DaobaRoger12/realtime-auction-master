/**
 * 全局唯一的 AuctionSocket，随登录态变化重建连接。
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuctionSocket, type ConnState } from '../lib/ws';
import { useAuth } from '../store/auth';

interface SocketCtx {
  socket: AuctionSocket;
  state: ConnState;
}

const Ctx = createContext<SocketCtx | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  const socketRef = useRef<AuctionSocket | null>(null);
  const [state, setState] = useState<ConnState>('connecting');

  if (!socketRef.current) {
    socketRef.current = new AuctionSocket(token);
  }

  useEffect(() => {
    // token 变化：重建连接（携带新的鉴权）
    const sock = new AuctionSocket(token);
    socketRef.current = sock;
    const off = sock.onState(setState);
    sock.connect();
    return () => {
      off();
      sock.close();
    };
  }, [token]);

  return (
    <Ctx.Provider value={{ socket: socketRef.current, state }}>{children}</Ctx.Provider>
  );
}

export function useSocket(): SocketCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSocket 必须在 SocketProvider 内使用');
  return c;
}
