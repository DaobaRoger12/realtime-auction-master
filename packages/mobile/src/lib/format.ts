export { formatMoney, fenToYuan, yuanToFen } from '@auction/shared';

/** 毫秒 → mm:ss.x（用于紧张倒计时） */
export function fmtCountdown(ms: number): { mm: string; ss: string; cs: string; urgent: boolean } {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const cs = String(Math.floor((clamped % 1000) / 100));
  return { mm, ss, cs, urgent: clamped <= 10_000 };
}

/** ISO → 友好时间 */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
