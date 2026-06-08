import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * 模拟直播画面：商品图作舞台背景 + 漂浮爱心 + LIVE 角标。
 * （真实场景可替换为视频流 / 开源播放器）
 */
export function LivePlayer({
  image,
  title,
  onlineCount,
  hostName,
}: {
  image: string | null;
  title: string;
  onlineCount: number;
  hostName: string;
}) {
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);

  useEffect(() => {
    const t = setInterval(() => {
      setHearts((h) => [...h.slice(-12), { id: Date.now() + Math.random(), x: 60 + Math.random() * 30 }]);
    }, 700);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        height: 300,
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/* 背景模糊 */}
      {image && (
        <img
          src={image}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(22px) brightness(0.5)',
            transform: 'scale(1.2)',
          }}
        />
      )}
      {/* 主体商品图 */}
      {image && (
        <motion.img
          src={image}
          alt={title}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 180,
            height: 180,
            objectFit: 'cover',
            borderRadius: 20,
            transform: 'translate(-50%,-50%)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            border: '2px solid rgba(255,255,255,0.15)',
          }}
        />
      )}

      {/* 顶部信息条 */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(0,0,0,0.4)',
            borderRadius: 999,
            padding: '4px 10px 4px 4px',
          }}
        >
          <div
            className="center"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--pink),var(--purple))',
              fontSize: 14,
            }}
          >
            🎙️
          </div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{hostName}</div>
          <span className="tag tag-live" style={{ marginLeft: 2 }}>
            <span className="live-dot" /> LIVE
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            background: 'rgba(0,0,0,0.4)',
            borderRadius: 999,
            padding: '5px 10px',
          }}
        >
          👀 {onlineCount.toLocaleString()} 在线
        </div>
      </div>

      {/* 漂浮爱心 */}
      {hearts.map((h) => (
        <motion.div
          key={h.id}
          initial={{ opacity: 0.9, y: 0, scale: 0.6 }}
          animate={{ opacity: 0, y: -160, scale: 1.2 }}
          transition={{ duration: 2.4, ease: 'easeOut' }}
          style={{ position: 'absolute', bottom: 14, left: `${h.x}%`, fontSize: 20, pointerEvents: 'none' }}
        >
          {['❤️', '💎', '🔥', '✨'][Math.floor(h.id) % 4]}
        </motion.div>
      ))}
    </div>
  );
}
