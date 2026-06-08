import type { ConnState } from '../lib/ws';

const MAP: Record<ConnState, { c: string; t: string }> = {
  open: { c: 'var(--green)', t: '实时' },
  connecting: { c: 'var(--gold)', t: '连接中' },
  reconnecting: { c: 'var(--gold)', t: '重连中' },
  closed: { c: 'var(--text-dim)', t: '已断开' },
};

/** WebSocket 连接状态指示（断线重连可视化） */
export function ConnBadge({ state }: { state: ConnState }) {
  const s = MAP[state];
  return (
    <span
      className="tag"
      style={{ background: 'rgba(0,0,0,0.35)', color: s.c, fontSize: 10 }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: s.c,
          animation: state === 'open' ? 'pulse-ring 1.6s infinite' : 'none',
        }}
      />
      {s.t}
    </span>
  );
}
