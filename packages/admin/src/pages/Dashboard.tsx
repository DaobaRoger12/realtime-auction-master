import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Tag, Button, Space, Popconfirm, message, Row, Col, Statistic, Image, Tooltip,
} from 'antd';
import { ReloadOutlined, EyeOutlined, PlayCircleOutlined, StopOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import { formatMoney, AuctionStatus, type AuctionWithProduct, type Order } from '@auction/shared';

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  LIVE: { color: 'red', text: '🔴 进行中' },
  PENDING: { color: 'purple', text: '⏳ 待开始' },
  ENDED: { color: 'default', text: '✅ 已结束' },
  CANCELED: { color: 'default', text: '🚫 已取消' },
};

export function Dashboard() {
  const nav = useNavigate();
  const [items, setItems] = useState<AuctionWithProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, o] = await Promise.all([api.listMine(undefined, 1, 100), api.myOrders(1, 100)]);
      setItems(a.items);
      setOrders(o.items);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // 轻量轮询，叠加 WS 监播
    return () => clearInterval(t);
  }, [load]);

  const liveCount = items.filter((a) => a.status === 'LIVE').length;
  const pendingCount = items.filter((a) => a.status === 'PENDING').length;
  const soldCount = orders.length;
  const gmv = orders.reduce((s, o) => s + o.amount, 0);

  const start = async (id: number) => {
    try {
      await api.startAuction(id);
      message.success('已开拍');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };
  const cancel = async (id: number) => {
    try {
      await api.cancelAuction(id, '主播取消异常竞拍');
      message.success('已取消');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    {
      title: '商品',
      dataIndex: ['product', 'title'],
      render: (_: any, r: AuctionWithProduct) => (
        <Space>
          <Image src={r.product.image || ''} width={44} height={44} style={{ borderRadius: 8, objectFit: 'cover' }} preview={false} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.product.title}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{r.product.category} · #{r.id}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => {
        const t = STATUS_TAG[s] ?? STATUS_TAG.ENDED;
        return <Tag color={t.color}>{t.text}</Tag>;
      },
    },
    {
      title: '当前/成交价',
      render: (_: any, r: AuctionWithProduct) => (
        <span style={{ color: '#ffd76a', fontWeight: 700 }}>
          {formatMoney(r.status === 'ENDED' ? r.finalPrice ?? r.currentPrice : r.currentPrice)}
        </span>
      ),
    },
    {
      title: '热度',
      render: (_: any, r: AuctionWithProduct) => (
        <span style={{ fontSize: 13 }}>
          {r.bidCount} 出价 / {r.participantCount} 人{r.delayCount > 0 && <Tag color="cyan" style={{ marginLeft: 6 }}>延时{r.delayCount}</Tag>}
        </span>
      ),
    },
    {
      title: '规则',
      render: (_: any, r: AuctionWithProduct) => (
        <Tooltip title={`起拍${formatMoney(r.rules.startPrice)} · 加价${formatMoney(r.rules.bidIncrement)} · ${r.rules.capPrice != null ? '封顶' + formatMoney(r.rules.capPrice) : '不封顶'} · 延时${r.rules.delaySec}s`}>
          <span style={{ fontSize: 12, color: '#aaa' }}>
            +{formatMoney(r.rules.bidIncrement)} / {r.rules.durationSec}s
          </span>
        </Tooltip>
      ),
    },
    {
      title: '结束时间',
      dataIndex: 'endAt',
      render: (v: string) => <span style={{ fontSize: 12 }}>{dayjs(v).format('MM-DD HH:mm:ss')}</span>,
    },
    {
      title: '操作',
      render: (_: any, r: AuctionWithProduct) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => nav(`/monitor/${r.id}`)}>
            {r.status === 'LIVE' ? '监播' : '详情'}
          </Button>
          {r.status === 'PENDING' && (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => start(r.id)}>
              开拍
            </Button>
          )}
          {(r.status === 'LIVE' || r.status === 'PENDING') && (
            <Popconfirm title="确定取消这场竞拍？" onConfirm={() => cancel(r.id)} okText="取消竞拍" cancelText="再想想">
              <Button size="small" danger icon={<StopOutlined />}>
                取消
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={6}><div className="stat-card"><Statistic title="进行中" value={liveCount} valueStyle={{ color: '#fe2c55' }} /></div></Col>
        <Col span={6}><div className="stat-card"><Statistic title="待开始" value={pendingCount} valueStyle={{ color: '#8a5cff' }} /></div></Col>
        <Col span={6}><div className="stat-card"><Statistic title="成交订单" value={soldCount} valueStyle={{ color: '#3ad29f' }} /></div></Col>
        <Col span={6}><div className="stat-card"><Statistic title="成交 GMV" value={formatMoney(gmv)} valueStyle={{ color: '#ffd76a' }} /></div></Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>竞拍管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => nav('/publish')}>发布竞拍</Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={columns as any}
        pagination={{ pageSize: 10 }}
        rowClassName={(r) => (r.status === 'LIVE' ? 'bid-row-new' : '')}
      />
    </div>
  );
}
