/**
 * useCountdown —— 基于服务器对时的高精度倒计时。
 * 用 requestAnimationFrame 每帧刷新，remaining = endAt - serverNow()，
 * 保证所有客户端看到一致且毫秒级精确的倒计时。
 */
import { useEffect, useRef, useState } from 'react';

export function useCountdown(endAtIso: string | undefined, serverNow: () => number) {
  const [remaining, setRemaining] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!endAtIso) return;
    const endMs = new Date(endAtIso).getTime();
    const tick = () => {
      setRemaining(Math.max(0, endMs - serverNow()));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [endAtIso, serverNow]);

  return remaining;
}
