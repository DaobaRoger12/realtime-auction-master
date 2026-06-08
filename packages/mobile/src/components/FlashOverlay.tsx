import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { RoomFlash } from '../hooks/useAuctionRoom';

/**
 * 情绪反馈浮层：领先 / 被超越 / 延时 的全屏瞬时反馈。
 * 由 flash.key 驱动，自动消失。
 */
export function FlashOverlay({ flash }: { flash: RoomFlash }) {
  const [active, setActive] = useState<RoomFlash | null>(null);

  useEffect(() => {
    if (flash.kind === 'lead' || flash.kind === 'overtaken' || flash.kind === 'delay') {
      setActive(flash);
      const t = setTimeout(() => setActive(null), flash.kind === 'delay' ? 1400 : 1100);
      return () => clearTimeout(t);
    }
  }, [flash.key, flash.kind]);

  const conf = active ? CONF[active.kind as 'lead' | 'overtaken' | 'delay'] : null;

  return (
    <AnimatePresence>
      {active && conf && (
        <motion.div
          key={active.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: active.kind === 'delay' ? 'flex-start' : 'center',
            justifyContent: 'center',
            paddingTop: active.kind === 'delay' ? 120 : 0,
            zIndex: 50,
          }}
        >
          <motion.div
            initial={{ scale: 0.4, y: active.kind === 'overtaken' ? 0 : 30 }}
            animate={
              active.kind === 'overtaken'
                ? { scale: [0.6, 1.15, 1], x: [0, -10, 10, -6, 6, 0] }
                : { scale: [0.4, 1.2, 1], y: 0 }
            }
            transition={{ duration: 0.5 }}
            style={{
              fontWeight: 900,
              fontSize: active.kind === 'delay' ? 22 : 44,
              textShadow: `0 4px 30px ${conf.glow}`,
              background: conf.bg,
              borderRadius: 14,
              ...(active.kind === 'delay'
                ? {
                    color: '#fff',
                    WebkitTextFillColor: '#fff',
                    padding: '10px 18px',
                    boxShadow: `0 8px 30px ${conf.glow}`,
                  }
                : {
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    padding: 0,
                  }),
            }}
          >
            {conf.text}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const CONF = {
  lead: {
    text: '🎉 领先！',
    bg: 'linear-gradient(135deg,#ffd76a,#fe2c55)',
    glow: 'rgba(255,183,71,0.6)',
  },
  overtaken: {
    text: '⚡ 被超越！',
    bg: 'linear-gradient(135deg,#ff5277,#8a5cff)',
    glow: 'rgba(254,44,85,0.6)',
  },
  delay: {
    text: '⏱️ 竞拍延时！',
    bg: 'linear-gradient(135deg,#25f4ee,#8a5cff)',
    glow: 'rgba(37,244,238,0.5)',
  },
} as const;
