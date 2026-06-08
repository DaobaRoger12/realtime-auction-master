import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Image, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import type { Product } from '@auction/shared';

const CATEGORIES = ['珠宝', '艺术品', '二手奢侈品', '潮玩手办', '名酒', '其他'];

export function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.listProducts().then(setItems).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async (v: any) => {
    try {
      await api.createProduct({ ...v, image: v.image || null });
      message.success('商品已创建');
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>商品库</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新建商品
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: '商品',
            render: (_: any, r: Product) => (
              <Space>
                <Image src={r.image || ''} width={44} height={44} style={{ borderRadius: 8, objectFit: 'cover' }} preview={false} />
                <div>
                  <div style={{ fontWeight: 600 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>#{r.id}</div>
                </div>
              </Space>
            ),
          },
          { title: '品类', dataIndex: 'category', render: (c: string) => <span>{c}</span> },
          { title: '介绍', dataIndex: 'description', ellipsis: true },
          { title: '创建时间', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('MM-DD HH:mm') },
        ]}
      />

      <Modal title="新建商品" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="创建">
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ category: '珠宝' }}>
          <Form.Item name="title" label="商品名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="品类" rules={[{ required: true }]}>
            <Select options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="image" label="图片 URL">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="description" label="介绍" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
