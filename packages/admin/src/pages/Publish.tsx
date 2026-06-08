import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Form, Input, InputNumber, Select, Button, Card, Row, Col, DatePicker, message, Divider, Image, Space, Alert,
} from 'antd';
import { ThunderboltOutlined, RocketOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import { yuanToFen, fenToYuan } from '@auction/shared';

const CATEGORIES = ['珠宝', '艺术品', '二手奢侈品', '潮玩手办', '名酒', '其他'];

export function Publish() {
  const nav = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [image, setImage] = useState('');
  const [keywords, setKeywords] = useState('');

  useEffect(() => {
    api.aiStatus().then((s) => setAiAvailable(s.available)).catch(() => {});
  }, []);

  const runAi = async () => {
    const title = form.getFieldValue('title');
    const category = form.getFieldValue('category');
    if (!title || !category) {
      message.warning('请先填写商品名称和品类');
      return;
    }
    setAiLoading(true);
    try {
      const r = await api.aiDescribe(title, category, keywords);
      const patch: any = { title: r.title || title, description: r.description };
      const sr = r.suggestedRules ?? {};
      if (sr.startPrice != null) patch.startPrice = fenToYuan(sr.startPrice);
      if (sr.bidIncrement != null) patch.bidIncrement = fenToYuan(sr.bidIncrement);
      if (sr.capPrice != null) patch.capPrice = fenToYuan(sr.capPrice);
      if (sr.durationSec != null) patch.durationSec = sr.durationSec;
      form.setFieldsValue(patch);
      message.success('AI 已生成文案与推荐规则，可继续微调');
    } catch (e: any) {
      message.error(e.message || 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  const onFinish = async (v: any) => {
    setSubmitting(true);
    try {
      const rules = {
        startPrice: yuanToFen(v.startPrice ?? 0),
        bidIncrement: yuanToFen(v.bidIncrement),
        capPrice: v.capPrice != null && v.capPrice !== '' ? yuanToFen(v.capPrice) : null,
        durationSec: v.durationSec,
        antiSnipeWindowSec: v.antiSnipeWindowSec,
        delaySec: v.delaySec,
        maxDelayTimes: v.maxDelayTimes,
      };
      const created = await api.createAuction({
        product: {
          title: v.title,
          image: v.image || null,
          description: v.description,
          category: v.category,
        },
        rules,
        startAt: v.startAt ? dayjs(v.startAt).toISOString() : undefined,
      });
      message.success(`竞拍已发布（#${created.id}，${created.status === 'LIVE' ? '已开拍' : '待开始'}）`);
      nav('/');
    } catch (e: any) {
      message.error(e.message || '发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <h2>发布竞拍</h2>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          category: '珠宝',
          startPrice: 0,
          bidIncrement: 100,
          capPrice: 50000,
          durationSec: 300,
          antiSnipeWindowSec: 15,
          delaySec: 15,
          maxDelayTimes: 10,
        }}
      >
        <Row gutter={20}>
          <Col span={14}>
            <Card title="📦 商品信息" style={{ marginBottom: 16 }}>
              <Form.Item name="title" label="商品名称" rules={[{ required: true, message: '请输入商品名称' }]}>
                <Input placeholder="如：天然缅甸翡翠满绿手镯" />
              </Form.Item>
              <Form.Item name="category" label="品类" rules={[{ required: true }]}>
                <Select options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
              <Form.Item name="image" label="商品图片 URL">
                <Input placeholder="https://..." onChange={(e) => setImage(e.target.value)} />
              </Form.Item>
              {image && (
                <Image src={image} width={120} height={120} style={{ borderRadius: 8, objectFit: 'cover', marginBottom: 12 }} />
              )}

              {aiAvailable && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="AI 文案助手（豆包 Doubao-Seed-2.0-lite）"
                  description={
                    <Space.Compact style={{ width: '100%', marginTop: 6 }}>
                      <Input
                        placeholder="卖点关键词（可选），如：满绿 冰种 收藏级"
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                      />
                      <Button type="primary" icon={<ThunderboltOutlined />} loading={aiLoading} onClick={runAi}>
                        AI 生成
                      </Button>
                    </Space.Compact>
                  }
                />
              )}

              <Form.Item name="description" label="商品介绍" rules={[{ required: true, message: '请输入商品介绍' }]}>
                <Input.TextArea rows={5} placeholder="材质、工艺、稀缺性、适用场景…（可用上方 AI 一键生成）" />
              </Form.Item>
            </Card>
          </Col>

          <Col span={10}>
            <Card title="⚙️ 竞拍规则" style={{ marginBottom: 16 }}>
              <Form.Item name="startPrice" label="起拍价（元，可 0 元起拍）" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} addonAfter="元" />
              </Form.Item>
              <Form.Item name="bidIncrement" label="加价幅度（元）" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} addonAfter="元" />
              </Form.Item>
              <Form.Item name="capPrice" label="封顶价（元，留空=不封顶）" tooltip="达到封顶价自动成交">
                <InputNumber min={1} style={{ width: '100%' }} addonAfter="元" />
              </Form.Item>
              <Form.Item name="durationSec" label="竞拍时长（秒）" rules={[{ required: true }]}>
                <InputNumber min={10} style={{ width: '100%' }} addonAfter="秒" />
              </Form.Item>
              <Divider style={{ margin: '8px 0 16px' }}>防狙击延时</Divider>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="antiSnipeWindowSec" label="触发窗口(秒)" tooltip="结束前该窗口内出价则延时">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="delaySec" label="每次延时(秒)" tooltip="题目推荐 10~30 秒">
                    <InputNumber min={5} max={60} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="maxDelayTimes" label="最大延时次数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Card>

            <Card title="🕐 开拍时间">
              <Form.Item name="startAt" label="计划开始时间（留空=立即开拍）">
                <DatePicker showTime style={{ width: '100%' }} placeholder="立即开拍" />
              </Form.Item>
            </Card>
          </Col>
        </Row>

        <Button type="primary" size="large" htmlType="submit" icon={<RocketOutlined />} loading={submitting} block>
          发布竞拍
        </Button>
      </Form>
    </div>
  );
}
