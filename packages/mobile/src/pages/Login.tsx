import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { sound } from '../lib/sound';

export function Login() {
  const nav = useNavigate();
  const { login, register, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('buyer1');
  const [password, setPassword] = useState('123456');
  const [nickname, setNickname] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    sound.unlock();
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), password, nickname.trim() || username.trim());
      nav('/');
    } catch (e: any) {
      setErr(e.message || '操作失败');
    }
  };

  const demoAccounts = ['buyer1', 'buyer2', 'buyer3'];

  return (
    <div style={{ padding: '64px 24px', minHeight: '100vh' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', marginBottom: 36 }}
      >
        <div style={{ fontSize: 40 }}>🔨</div>
        <h1 style={{ fontSize: 26, margin: '12px 0 4px', letterSpacing: 1 }}>
          实时竞拍<span style={{ color: 'var(--pink)' }}>大师</span>
        </h1>
        <p className="dim" style={{ fontSize: 13 }}>
          稀世好物 · 实时竞价 · 价高者得
        </p>
      </motion.div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 10,
                background: mode === m ? 'var(--pink)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--text-dim)',
                fontWeight: 600,
              }}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <Field label="账号" value={username} onChange={setUsername} placeholder="用户名" />
        {mode === 'register' && (
          <Field label="昵称" value={nickname} onChange={setNickname} placeholder="你的昵称" />
        )}
        <Field
          label="密码"
          value={password}
          onChange={setPassword}
          placeholder="密码"
          type="password"
        />

        {err && (
          <div style={{ color: 'var(--pink-2)', fontSize: 13, margin: '6px 0' }}>{err}</div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 12, padding: 14 }}
          onClick={submit}
          disabled={loading}
        >
          {loading ? '处理中…' : mode === 'login' ? '进入直播间' : '注册并进入'}
        </button>
      </div>

      {mode === 'login' && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
            演示买家账号（密码 123456）
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {demoAccounts.map((a) => (
              <button
                key={a}
                className="btn btn-ghost"
                style={{ fontSize: 13, padding: '8px 14px' }}
                onClick={() => {
                  setUsername(a);
                  setPassword('123456');
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="dim" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        value={value}
        type={type}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid var(--card-border)',
          color: 'var(--text)',
          fontSize: 15,
        }}
      />
    </div>
  );
}
