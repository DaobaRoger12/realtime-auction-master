import { useEffect, useState } from 'react';
import { Table, Tag, Image, Space, Statistic, Row, Col } from 'antd';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import { formatMoney, type Order } from '@auction/shared';

const STATUS: Record<string, { color: string; text: string }> = {
  PENDING_PAYMENT: { color: 'orange', text: '待支付' },
  PAID: { color: 'green', text: '已支付' },
  CANCELED: { color: 'default', text: '已取消' },
};

export function Orders() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.myOrders(1, 100).then((r) => setItems(r.items)).finally(() => setLoading(false));
  }, []);

  const gmv = items.reduce((s, o) => s + o.amount, 0);
  const paid = items.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.amount, 0);

  return (
    <div>
      <h2>订单管理</h2>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><div className="stat-card"><Statistic title="成交订单数" value={items.length} /></div></Col>
        <Col span={8}><div className="stat-card"><Statistic title="成交 GMV" value={formatMoney(gmv)} valueStyle={{ color: '#ffd76a' }} /></div></Col>
        <Col span={8}><div className="stat-card"><Statistic title="已回款" value={formatMoney(paid)} valueStyle={{ color: '#3ad29f' }} /></div></Col>
      </Row>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 12 }}
        columns={[
          { title: '订单号', dataIndex: 'orderNo', render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
          {
            title: '商品',
            render: (_: any, r: Order) => (
              <Space>
                <Image src={r.productImage || ''} width={40} height={40} style={{ borderRadius: 6, objectFit: 'cover' }} preview={false} />
                <span>{r.productTitle}</span>
              </Space>
            ),
          },
          { title: '买家', dataIndex: 'buyerNickname' },
          { title: '成交价', dataIndex: 'amount', render: (v: number) => <span style={{ color: '#ffd76a', fontWeight: 700 }}>{formatMoney(v)}</span> },
          { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={STATUS[s]?.color}>{STATUS[s]?.text}</Tag> },
          { title: '成交时间', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss') },
        ]}
      />
    </div>
  );
}
