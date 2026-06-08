import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { AuctionEndedPayload, Order } from '@auction/shared';

/** 结果弹层：成交 / 流拍 / 取消，赢家可模拟支付 */
export function ResultSheet({
  ended,
  canceled,
  myId,
  auctionId,
  onClose,
}: {
  ended: AuctionEndedPayload | null;
  canceled: { reason: string } | null;
  myId: number | null;
  auctionId: number;
  onClose: () => void;
}) {
  const iWon = !!ended && ended.result === 'SOLD' && ended.winnerId === myId;
  const [order, setOrder] = useState<Order | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (iWon) {
      api.orderByAuction(auctionId).then(setOrder).catch(() => {});
    }
  }, [iWon, auctionId]);

  const pay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const updated = await api.payOrder(order.id);
      setOrder(updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPaying(false);
    }
  };

  const { emoji, title, sub } = resultText();

  function resultText() {
    if (canceled) return { emoji: '🚫', title: '竞拍已取消', sub: canceled.reason };
    if (!ended) return { emoji: '🏁', title: '竞拍结束', sub: '' };
    if (ended.result === 'UNSOLD') return { emoji: '🍃', title: '本场流拍', sub: '无人出价，下次再来' };
    if (iWon) return { emoji: '🎉', title: '恭喜，竞拍成功！', sub: '手快有手慢无，眼光独到' };
    return {
      emoji: '🏆',
      title: '竞拍已结束',
      sub: `由「${ended.winnerNickname}」以 ${formatMoney(ended.finalPrice ?? 0)} 拿下`,
    };
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', borderRadius: '24px 24px 0 0', padding: 24, textAlign: 'center' }}
      >
        <div style={{ fontSize: 56 }}>{emoji}</div>
        <h2 style={{ margin: '8px 0 4px', fontSize: 22 }}>{title}</h2>
        <p className="dim" style={{ fontSize: 13, marginBottom: 18 }}>{sub}</p>

        {ended && ended.result === 'SOLD' && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="dim" style={{ fontSize: 12 }}>成交价</div>
            <div style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 30 }}>
              {formatMoney(ended.finalPrice ?? 0)}
            </div>
            {ended.orderNo && (
              <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>订单号 {ended.orderNo}</div>
            )}
          </div>
        )}

        {iWon && order && (
          <div style={{ marginBottom: 12 }}>
            {order.status === 'PAID' ? (
              <div className="btn btn-gold" style={{ width: '100%', padding: 14 }}>
                ✅ 已支付，等待发货
              </div>
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: 16, fontSize: 17 }}
                onClick={pay}
                disabled={paying}
              >
                {paying ? '支付中…' : `💳 立即支付 ${formatMoney(order.amount)}`}
              </button>
            )}
          </div>
        )}

        <button className="btn btn-ghost" style={{ width: '100%', padding: 12 }} onClick={onClose}>
          {iWon ? '稍后再说' : '返回'}
        </button>
      </motion.div>
    </motion.div>
  );
}
