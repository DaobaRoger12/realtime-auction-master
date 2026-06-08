/**
 * 轻量音效（WebAudio 合成，无需音频文件）。
 * 用于出价、领先、被超越、延时、结束等氛围反馈。
 */
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

function tone(freq: number, durMs: number, type: OscillatorType = 'sine', gain = 0.06): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + durMs / 1000);
}

export const sound = {
  setMuted(v: boolean) {
    muted = v;
  },
  isMuted() {
    return muted;
  },
  /** 解锁音频（需用户手势触发一次） */
  unlock() {
    const c = ac();
    if (c?.state === 'suspended') c.resume();
  },
  bid() {
    tone(660, 90, 'triangle', 0.05);
  },
  lead() {
    tone(880, 110, 'sine', 0.06);
    setTimeout(() => tone(1175, 130, 'sine', 0.06), 90);
  },
  overtaken() {
    tone(330, 160, 'sawtooth', 0.05);
    setTimeout(() => tone(247, 200, 'sawtooth', 0.05), 110);
  },
  delay() {
    tone(523, 80, 'square', 0.04);
    setTimeout(() => tone(523, 80, 'square', 0.04), 140);
  },
  tick() {
    tone(440, 50, 'sine', 0.03);
  },
  end() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 180, 'sine', 0.06), i * 130));
  },
};
