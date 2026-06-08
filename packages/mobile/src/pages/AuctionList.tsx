import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAuth } from '../store/auth';
import { AuctionStatus, type AuctionWithProduct } from '@auction/shared';

const TABS: { key: string; label: string }[] = [
  { key: 'LIVE', label: '🔴 直播中' },
  { key: 'PENDING', label: '⏳ 预告' },
  { key: 'ENDED', label: '✅ 已结束' },
];

export function AuctionList() {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [tab, setTab] = useState('LIVE');
  const [items, setItems] = useState<AuctionWithProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .listAuctions({ status: tab, pageSize: 30 })
      .then((res) => alive && setItems(res.items))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tab]);

  return (
    <div style={{ paddingBottom: 24 }}>
      <header
        style={{
          padding: '16px 18px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>
            臻品<span style={{ color: 'var(--pink)' }}>拍卖场</span>
          </h1>
          <p className="dim" style={{ fontSize: 12, margin: '2px 0 0' }}>
            Hi，{user?.nickname} · 价高者得
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 13 }} onClick={() => nav('/orders')}>
            🧾 我的
          </button>
          <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 13 }} onClick={logout}>
            退出
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, padding: '8px 18px 16px' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="btn"
            style={{
              padding: '8px 14px',
              fontSize: 13,
              background: tab === t.key ? 'var(--card)' : 'transparent',
              border: tab === t.key ? '1px solid var(--pink)' : '1px solid transparent',
              color: tab === t.key ? '#fff' : 'var(--text-dim)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 110 }} />
          ))}
        {!loading && items.length === 0 && (
          <div className="center" style={{ height: 200, flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 40 }}>🗂️</div>
            <p className="dim">该分类暂无竞拍</p>
          </div>
        )}
        {!loading &&
          items.map((a, idx) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="card"
              onClick={() => nav(`/room/${a.id}`)}
              style={{ display: 'flex', gap: 12, padding: 12, alignItems: 'center' }}
            >
              <div style={{ position: 'relative' }}>
                <img
                  src={a.product.image || ''}
                  alt=""
                  style={{ width: 92, height: 92, borderRadius: 12, objectFit: 'cover', background: '#222' }}
                />
                <StatusTag status={a.status} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.product.title}
                </div>
                <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
                  {a.product.category} · {a.bidCount} 次出价 · {a.participantCount} 人参与
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <span className="dim" style={{ fontSize: 11 }}>
                      {a.status === AuctionStatus.ENDED ? '成交价' : '当前价'}
                    </span>
                    <div style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 19 }}>
                      {formatMoney(a.status === AuctionStatus.ENDED ? a.finalPrice ?? a.currentPrice : a.currentPrice)}
                    </div>
                  </div>
                  <span className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
                    {a.status === AuctionStatus.LIVE ? '去出价' : a.status === AuctionStatus.PENDING ? '看预告' : '看结果'}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: AuctionStatus }) {
  const map: Record<string, { cls: string; text: string }> = {
    LIVE: { cls: 'tag-live', text: '直播中' },
    PENDING: { cls: 'tag-pending', text: '预告' },
    ENDED: { cls: 'tag-ended', text: '已结束' },
    CANCELED: { cls: 'tag-ended', text: '已取消' },
  };
  const s = map[status] ?? map.ENDED;
  return (
    <span
      className={`tag ${s.cls}`}
      style={{ position: 'absolute', top: 6, left: 6 }}
    >
      {status === 'LIVE' && <span className="live-dot" />}
      {s.text}
    </span>
  );
}
