import { AnimatePresence, motion } from 'framer-motion';
import { formatMoney } from '../lib/format';
import type { RankingEntry } from '@auction/shared';

const MEDAL = ['🥇', '🥈', '🥉'];

/** 实时排行榜，按最高出价降序，高亮「我」，重排带布局动画 */
export function Ranking({ entries, myId }: { entries: RankingEntry[]; myId: number | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>🏆 实时排行榜</span>
        <span className="dim" style={{ fontSize: 12 }}>{entries.length} 人竞价</span>
      </div>

      {entries.length === 0 && (
        <div className="dim center" style={{ height: 60, fontSize: 13 }}>
          虚位以待，抢首拍！
        </div>
      )}

      <AnimatePresence initial={false}>
        {entries.map((e) => {
          const mine = e.userId === myId;
          return (
            <motion.div
              layout
              key={e.userId}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 12,
                background: mine
                  ? 'linear-gradient(135deg, rgba(254,44,85,0.22), rgba(138,92,255,0.18))'
                  : 'rgba(255,255,255,0.04)',
                border: e.isLeader ? '1px solid var(--gold)' : '1px solid transparent',
              }}
            >
              <div style={{ width: 24, textAlign: 'center', fontWeight: 700 }}>
                {e.rank <= 3 ? MEDAL[e.rank - 1] : e.rank}
              </div>
              <div
                className="center"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,var(--purple),var(--cyan))',
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {e.nickname.slice(0, 1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.nickname}
                  </span>
                  {mine && <span className="tag tag-live" style={{ fontSize: 9 }}>我</span>}
                  {e.isLeader && <span className="tag" style={{ fontSize: 9, background: 'rgba(255,215,106,0.2)', color: 'var(--gold)' }}>领先</span>}
                </div>
              </div>
              <div style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 14 }}>
                {formatMoney(e.bestAmount)}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
