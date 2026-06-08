import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuctionRoom } from '../hooks/useAuctionRoom';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../store/auth';
import { api } from '../lib/api';
import { sound } from '../lib/sound';
import { formatMoney, fmtCountdown } from '../lib/format';
import { LivePlayer } from '../components/LivePlayer';
import { Countdown } from '../components/Countdown';
import { Ranking } from '../components/Ranking';
import { BidPanel } from '../components/BidPanel';
import { FlashOverlay } from '../components/FlashOverlay';
import { ResultSheet } from '../components/ResultSheet';
import { ConnBadge } from '../components/ConnBadge';
import { BidRejectReason } from '@auction/shared';

export function LiveRoom() {
  const { id } = useParams();
  const auctionId = Number(id);
  const nav = useNavigate();
  const myId = useAuth((s) => s.user?.id ?? null);
  const { state, flash, reject, bid, quickBid, connState, serverNow } = useAuctionRoom(auctionId);
  const a = state.auction;

  const isLive = a?.status === 'LIVE';
  const isPending = a?.status === 'PENDING';
  const target = isPending ? a?.startAt : a?.endAt;
  const remaining = useCountdown(target, serverNow);

  const [muted, setMuted] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [commentary, setCommentary] = useState('🎙️ 欢迎来到直播间，宝贝马上开拍！');

  // 结束 / 取消 → 弹出结果
  useEffect(() => {
    if (state.ended || state.canceled) {
      const t = setTimeout(() => setShowResult(true), 700);
      return () => clearTimeout(t);
    }
  }, [state.ended, state.canceled]);

  // 出价被拒 → toast
  useEffect(() => {
    if (!reject) return;
    if (reject.reason === BidRejectReason.RATE_LIMITED) return; // 限流静默
    setToast({ text: reject.message, key: reject.key });
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [reject?.key]);

  /* ---------------- AI 拍卖师话术（开场 / 临近结束 / 成交） ---------------- */
  const saidOpen = useRef(false);
  const saidEnding = useRef(false);
  const saidSold = useRef(false);
  const fetchSay = (scene: 'open' | 'bid' | 'ending' | 'sold') => {
    api
      .aiCommentary(auctionId, scene)
      .then((r) => r.text && setCommentary(`🎙️ ${r.text}`))
      .catch(() => {});
  };
  useEffect(() => {
    if (a && !saidOpen.current) {
      saidOpen.current = true;
      fetchSay(isLive ? 'open' : 'open');
    }
  }, [a]);
  useEffect(() => {
    if (isLive && remaining > 0 && remaining <= 30_000 && !saidEnding.current) {
      saidEnding.current = true;
      fetchSay('ending');
    }
  }, [remaining, isLive]);
  useEffect(() => {
    if (state.ended && state.ended.result === 'SOLD' && !saidSold.current) {
      saidSold.current = true;
      fetchSay('sold');
    }
  }, [state.ended]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
    if (!next) sound.unlock();
  };

  if (!a) {
    return (
      <div className="center" style={{ height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div className="skeleton" style={{ width: 60, height: 60, borderRadius: 16 }} />
        <p className="dim">进入直播间…</p>
      </div>
    );
  }

  const pc = fmtCountdown(remaining);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 14px',
        }}
      >
        <button
          className="center"
          onClick={() => nav('/')}
          style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 18 }}
        >
          ‹
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ConnBadge state={connState} />
          <button
            className="center"
            onClick={toggleMute}
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', fontSize: 16 }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* 直播画面 */}
      <LivePlayer
        image={a.product.image}
        title={a.product.title}
        onlineCount={state.onlineCount}
        hostName="臻品主播间"
      />

      <FlashOverlay flash={flash} />

      {/* AI 拍卖师话术滚动条 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={commentary}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          style={{
            margin: '-22px 14px 0',
            position: 'relative',
            zIndex: 30,
            background: 'linear-gradient(135deg, rgba(138,92,255,0.9), rgba(254,44,85,0.85))',
            borderRadius: 12,
            padding: '8px 12px',
            fontSize: 12.5,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(138,92,255,0.35)',
          }}
        >
          {commentary}
        </motion.div>
      </AnimatePresence>

      {/* 内容区 */}
      <div style={{ flex: 1, padding: '14px 16px 96px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 标题 + 规则 */}
        <div>
          <h1 style={{ fontSize: 18, margin: '0 0 6px' }}>{a.product.title}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Chip>起拍 {formatMoney(a.rules.startPrice)}</Chip>
            <Chip>加价 {formatMoney(a.rules.bidIncrement)}</Chip>
            {a.rules.capPrice != null && <Chip>封顶 {formatMoney(a.rules.capPrice)}</Chip>}
            <Chip>延时 {a.rules.delaySec}s</Chip>
          </div>
        </div>

        {/* 价格 + 倒计时大卡 */}
        <div
          className="card"
          style={{
            padding: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, rgba(254,44,85,0.12), rgba(138,92,255,0.1))',
          }}
        >
          <div>
            <div className="dim" style={{ fontSize: 12 }}>
              {a.status === 'ENDED' ? '成交价' : '当前价'}
            </div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={a.currentPrice}
                initial={{ scale: 1.3, color: '#fff' }}
                animate={{ scale: 1, color: '#ffd76a' }}
                style={{ fontWeight: 800, fontSize: 30 }}
              >
                {formatMoney(a.status === 'ENDED' ? a.finalPrice ?? a.currentPrice : a.currentPrice)}
              </motion.div>
            </AnimatePresence>
            <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
              {a.bidCount} 次出价 · {state.participantCount} 人参与
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="dim" style={{ fontSize: 12, marginBottom: 4 }}>
              {isPending ? '距开拍' : isLive ? (pc.urgent ? '🔥 即将结束' : '距结束') : '已结束'}
            </div>
            {a.status === 'LIVE' || isPending ? (
              <Countdown remaining={remaining} />
            ) : (
              <span className="tag tag-ended">已结束</span>
            )}
            {a.delayCount > 0 && (
              <div style={{ color: 'var(--cyan)', fontSize: 11, marginTop: 4 }}>
                已延时 {a.delayCount} 次
              </div>
            )}
          </div>
        </div>

        {isPending && (
          <div className="card center" style={{ padding: 16, flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 30 }}>⏳</div>
            <div style={{ fontWeight: 600 }}>竞拍即将开始</div>
            <div className="dim" style={{ fontSize: 12 }}>开拍后即可出价，先收藏不迷路</div>
          </div>
        )}

        {/* 排行榜 */}
        <div className="card" style={{ padding: 14 }}>
          <Ranking entries={state.ranking} myId={myId} />
        </div>

        {/* 商品介绍 */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>📦 商品介绍</div>
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
            {a.product.description}
          </p>
        </div>
      </div>

      {/* 出价面板（仅进行中） */}
      {isLive && (
        <BidPanel
          currentPrice={a.currentPrice}
          rules={a.rules}
          iAmLeading={state.iAmLeading}
          disabled={connState === 'closed'}
          onBid={bid}
          onQuickBid={quickBid}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.key}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'absolute',
              bottom: 120,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              padding: '10px 18px',
              borderRadius: 12,
              fontSize: 13,
              zIndex: 80,
              whiteSpace: 'nowrap',
            }}
          >
            ⚠️ {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 结果弹层 */}
      <AnimatePresence>
        {showResult && (
          <ResultSheet
            ended={state.ended}
            canceled={state.canceled}
            myId={myId}
            auctionId={auctionId}
            onClose={() => setShowResult(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '3px 9px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid var(--card-border)',
        color: 'var(--text-dim)',
      }}
    >
      {children}
    </span>
  );
}
