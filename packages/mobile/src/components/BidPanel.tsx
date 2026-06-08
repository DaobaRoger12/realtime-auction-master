import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { computeMinNextBid, formatMoney, type AuctionRules } from '@auction/shared';

/**
 * 出价面板：一键加价 / 自定义档位 / 封顶一口价。
 * 前端做规则即时反馈（最低应价、封顶），最终以服务端校验为准。
 */
export function BidPanel({
  currentPrice,
  rules,
  iAmLeading,
  disabled,
  onBid,
  onQuickBid,
}: {
  currentPrice: number;
  rules: AuctionRules;
  iAmLeading: boolean;
  disabled: boolean;
  onBid: (amount: number) => void;
  onQuickBid: () => void;
}) {
  const minNext = computeMinNextBid(currentPrice, rules);
  const [amount, setAmount] = useState(minNext);

  // 当前价变化时，把自定义额度抬到最低应价
  useEffect(() => {
    setAmount((a) => (a < minNext ? minNext : a));
  }, [minNext]);

  const cap = rules.capPrice;
  const atCap = cap != null && amount >= cap;
  const step = rules.bidIncrement;

  const dec = () => setAmount((a) => Math.max(minNext, a - step));
  const inc = () => setAmount((a) => (cap != null ? Math.min(cap, a + step) : a + step));

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        padding: '12px 16px calc(12px + var(--safe-bottom))',
        background: 'linear-gradient(180deg, rgba(11,11,20,0), rgba(11,11,20,0.95) 30%)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* 档位调节 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Stepper onClick={dec} disabled={disabled || amount <= minNext}>
          −
        </Stepper>
        <div
          className="card"
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px 0',
            borderColor: atCap ? 'var(--gold)' : 'var(--card-border)',
          }}
        >
          <div className="dim" style={{ fontSize: 10 }}>
            我的出价 {atCap && '· 封顶价'}
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--gold)' }}>
            {formatMoney(amount)}
          </div>
        </div>
        <Stepper onClick={inc} disabled={disabled || atCap}>
          ＋
        </Stepper>
      </div>

      {/* 主操作 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-ghost"
          style={{ flex: 1, padding: 14 }}
          disabled={disabled}
          onClick={() => onBid(amount)}
        >
          出价 {formatMoney(amount)}
        </button>
        <motion.button
          whileTap={{ scale: 0.94 }}
          className="btn btn-primary"
          style={{ flex: 1.4, padding: 14, fontSize: 16, position: 'relative' }}
          disabled={disabled}
          onClick={onQuickBid}
        >
          {iAmLeading ? '🔥 继续加价' : `⚡ 一键加价 ${formatMoney(minNext)}`}
        </motion.button>
      </div>

      {iAmLeading && (
        <div style={{ textAlign: 'center', marginTop: 8, color: 'var(--gold)', fontSize: 12, fontWeight: 600 }}>
          👑 你当前领先，守住它！
        </div>
      )}
    </div>
  );
}

function Stepper({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="center"
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        background: 'var(--card)',
        border: '1px solid var(--card-border)',
        color: 'var(--text)',
        fontSize: 22,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}
