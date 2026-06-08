import { useEffect, useRef } from 'react';
import { fmtCountdown } from '../lib/format';
import { sound } from '../lib/sound';

/** 毫秒级倒计时展示。<=10s 进入紧张红色 + 每秒滴答音。 */
export function Countdown({ remaining }: { remaining: number }) {
  const { mm, ss, cs, urgent } = fmtCountdown(remaining);
  const lastSec = useRef(-1);

  useEffect(() => {
    const sec = Math.ceil(remaining / 1000);
    if (urgent && sec !== lastSec.current && sec > 0 && sec <= 10) {
      sound.tick();
    }
    lastSec.current = sec;
  }, [remaining, urgent]);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 2,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 800,
        color: urgent ? '#fff' : 'var(--text)',
        background: urgent ? 'linear-gradient(135deg,var(--pink),var(--pink-2))' : 'rgba(0,0,0,0.3)',
        padding: '4px 10px',
        borderRadius: 10,
        boxShadow: urgent ? '0 0 18px rgba(254,44,85,0.6)' : 'none',
        transform: urgent ? `scale(${1 + (Math.sin(remaining / 120) + 1) * 0.02})` : 'none',
        transition: 'background 0.3s',
      }}
    >
      <span style={{ fontSize: 22 }}>{mm}</span>
      <span style={{ fontSize: 18, opacity: 0.6 }}>:</span>
      <span style={{ fontSize: 22 }}>{ss}</span>
      <span style={{ fontSize: 13, opacity: 0.7, width: 14 }}>.{cs}</span>
    </div>
  );
}
