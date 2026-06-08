import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Spin } from 'antd';
import {
  DashboardOutlined,
  PlusCircleOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useAuth } from './store/auth';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Publish } from './pages/Publish';
import { Products } from './pages/Products';
import { Orders } from './pages/Orders';
import { LiveMonitor } from './pages/LiveMonitor';

const { Sider, Header, Content } = Layout;

const MENU = [
  { key: '/', icon: <DashboardOutlined />, label: '竞拍管理' },
  { key: '/publish', icon: <PlusCircleOutlined />, label: '发布竞拍' },
  { key: '/products', icon: <AppstoreOutlined />, label: '商品库' },
  { key: '/orders', icon: <FileTextOutlined />, label: '订单管理' },
];

export function App() {
  const { token, user, bootstrap, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (loc.pathname === '/login') return <Login />;
  if (!token) return <Navigate to="/login" state={{ from: loc }} />;

  const selectedKey = MENU.find((m) => m.key === loc.pathname)?.key || loc.pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" breakpoint="lg" collapsedWidth="0" width={216}>
        <div style={{ padding: '20px 16px', fontSize: 18, fontWeight: 800 }}>
          🔨 <span className="brand-gradient">竞拍大师</span>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 400, marginTop: 2 }}>
            商家管理后台
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU}
          onClick={({ key }) => nav(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#13131d',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingInline: 24,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { logout(); nav('/login'); } }],
            }}
          >
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar style={{ background: 'linear-gradient(135deg,#fe2c55,#8a5cff)' }}>
                {user?.nickname?.[0] ?? 'M'}
              </Avatar>
              <span>{user?.nickname}</span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/publish" element={<Publish />} />
            <Route path="/products" element={<Products />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/monitor/:id" element={<LiveMonitor />} />
            <Route path="*" element={<div><Spin /></div>} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
