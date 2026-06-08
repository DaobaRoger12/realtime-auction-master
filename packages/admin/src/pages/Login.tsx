import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Tabs, message, Card } from 'antd';
import { useAuth } from '../store/auth';

export function Login() {
  const nav = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);

  const onFinish = async (v: any) => {
    setLoading(true);
    try {
      if (mode === 'login') await login(v.username, v.password);
      else await register(v.username, v.password, v.nickname || v.username);
      message.success('欢迎回来');
      nav('/');
    } catch (e: any) {
      message.error(e.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(120% 80% at 50% 0%, #1b1430 0%, #0c0c14 60%)',
      }}
    >
      <Card style={{ width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} variant="borderless">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 34 }}>🔨</div>
          <h2 style={{ margin: '8px 0 0' }}>
            实时竞拍<span className="brand-gradient">大师</span>
          </h2>
          <p style={{ color: '#888', fontSize: 13 }}>商家 / 主播管理后台</p>
        </div>
        <Tabs
          activeKey={mode}
          onChange={setMode}
          centered
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册商家' },
          ]}
        />
        <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'zhubo', password: '123456' }}>
          <Form.Item name="username" label="账号" rules={[{ required: true }]}>
            <Input size="large" placeholder="商家账号" />
          </Form.Item>
          {mode === 'register' && (
            <Form.Item name="nickname" label="直播间名称" rules={[{ required: true }]}>
              <Input size="large" placeholder="如：臻品主播间" />
            </Form.Item>
          )}
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password size="large" placeholder="密码" />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" loading={loading} block>
            {mode === 'login' ? '进入后台' : '注册并进入'}
          </Button>
        </Form>
        {mode === 'login' && (
          <p style={{ textAlign: 'center', color: '#666', fontSize: 12, marginTop: 12 }}>
            演示主播账号：zhubo / 123456
          </p>
        )}
      </Card>
    </div>
  );
}
