import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { formatMoney, fmtTime } from '../lib/format';
import type { Order } from '@auction/shared';

const STATUS: Record<string, { t: string; c: string }> = {
  PENDING_PAYMENT: { t: '待支付', c: 'var(--pink-2)' },
  PAID: { t: '已支付', c: 'var(--green)' },
  CANCELED: { t: '已取消', c: 'var(--text-dim)' },
};

export function Orders() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .myOrders(1, 50)
      .then((r) => setOrders(r.items))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const pay = async (o: Order) => {
    try {
      await api.payOrder(o.id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      <header style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="center"
          onClick={() => nav('/')}
          style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--card)', fontSize: 18 }}
        >
          ‹
        </button>
        <h1 style={{ fontSize: 20, margin: 0 }}>我的竞拍记录</h1>
      </header>

      <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && [0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 90 }} />)}
        {!loading && orders.length === 0 && (
          <div className="center" style={{ height: 200, flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 40 }}>🛍️</div>
            <p className="dim">还没有成交记录，去拍一件心仪好物吧</p>
            <button className="btn btn-primary" style={{ padding: '10px 20px' }} onClick={() => nav('/')}>
              去逛拍卖场
            </button>
          </div>
        )}
        {orders.map((o, i) => {
          const s = STATUS[o.status] ?? STATUS.CANCELED;
          return (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card"
              style={{ padding: 12, display: 'flex', gap: 12 }}
            >
              <img
                src={o.productImage || ''}
                alt=""
                style={{ width: 70, height: 70, borderRadius: 10, objectFit: 'cover', background: '#222' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.productTitle}
                </div>
                <div className="dim" style={{ fontSize: 11, margin: '4px 0' }}>
                  {fmtTime(o.createdAt)} · {o.orderNo}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{formatMoney(o.amount)}</span>
                  <span style={{ color: s.c, fontSize: 12, fontWeight: 600 }}>{s.t}</span>
                </div>
              </div>
              {o.status === 'PENDING_PAYMENT' && (
                <button className="btn btn-primary" style={{ alignSelf: 'center', fontSize: 12, padding: '8px 14px' }} onClick={() => pay(o)}>
                  支付
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
