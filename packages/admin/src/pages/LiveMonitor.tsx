import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card, Row, Col, Statistic, Tag, Button, List, Avatar, Popconfirm, message, Image, Badge, Empty,
} from 'antd';
import { ArrowLeftOutlined, StopOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { getToken } from '../lib/api';
import { AuctionSocket, type ConnState } from '../lib/ws';
import {
  formatMoney,
  WsServerEvent,
  type AuctionWithProduct,
  type RankingEntry,
  type BidAcceptedPayload,
} from '@auction/shared';

interface FeedItem {
  id: number;
  nickname: string;
  amount: number;
  ts: number;
}

export function LiveMonitor() {
  const { id } = useParams();
  const auctionId = Number(id);
  const nav = useNavigate();

  const [auction, setAuction] = useState<AuctionWithProduct | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [online, setOnline] = useState(0);
  const [participants, setParticipants] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [connState, setConnState] = useState<ConnState>('connecting');
  const sockRef = useRef<AuctionSocket | null>(null);

  const reload = useCallback(async () => {
    const a = await api.getAuction(auctionId);
    setAuction(a);
    setRanking(a.ranking || []);
    setOnline(a.onlineCount || 0);
    setParticipants(a.participantCount);
    const bids = await api.getBids(auctionId, 1, 30);
    setFeed(bids.items.map((b) => ({ id: b.id, nickname: b.nickname, amount: b.amount, ts: new Date(b.createdAt).getTime() })));
  }, [auctionId]);

  useEffect(() => {
    reload();
    const sock = new AuctionSocket(getToken());
    sockRef.current = sock;
    sock.onState(setConnState);
    sock.connect();
    sock.join(auctionId);

    const offs = [
      sock.on(WsServerEvent.SNAPSHOT, (d: any) => {
        if (d.auction.id !== auctionId) return;
        setAuction((prev) => ({ ...(prev as any), ...d.auction }));
        setRanking(d.ranking);
        setOnline(d.onlineCount);
      }),
      sock.on(WsServerEvent.BID_ACCEPTED, (d: BidAcceptedPayload) => {
        if (d.auctionId !== auctionId) return;
        setAuction((prev) => prev ? { ...prev, currentPrice: d.currentPrice, bidCount: d.bidCount, leaderId: d.leaderId, leaderNickname: d.nickname, endAt: d.endAt } as any : prev);
        setRanking(d.ranking);
        setParticipants(d.participantCount);
        setFeed((f) => [{ id: d.bidId, nickname: d.nickname, amount: d.amount, ts: Date.now() }, ...f].slice(0, 40));
      }),
      sock.on(WsServerEvent.PRESENCE, (d: any) => {
        if (d.auctionId !== auctionId) return;
        setOnline(d.onlineCount);
        setParticipants(d.participantCount);
      }),
      sock.on(WsServerEvent.AUCTION_DELAYED, (d: any) => {
        if (d.auctionId !== auctionId) return;
        setAuction((prev) => prev ? { ...prev, endAt: d.endAt, delayCount: d.delayCount } as any : prev);
        message.info(`触发防狙击延时（第 ${d.delayCount} 次，+${d.addedSec}s）`);
      }),
      sock.on(WsServerEvent.AUCTION_ENDED, (d: any) => {
        if (d.auctionId !== auctionId) return;
        message.success(d.result === 'SOLD' ? `成交！${d.winnerNickname} ${formatMoney(d.finalPrice)}` : '竞拍流拍');
        reload();
      }),
      sock.on(WsServerEvent.AUCTION_CANCELED, (d: any) => {
        if (d.auctionId !== auctionId) return;
        reload();
      }),
    ];

    const timer = setInterval(() => {
      setAuction((a) => {
        if (a && (a.status === 'LIVE' || a.status === 'PENDING')) {
          const target = a.status === 'PENDING' ? a.startAt : a.endAt;
          setRemaining(Math.max(0, new Date(target).getTime() - sock.serverNow()));
        }
        return a;
      });
    }, 200);

    return () => {
      offs.forEach((f) => f());
      clearInterval(timer);
      sock.close();
    };
  }, [auctionId, reload]);

  if (!auction) return <Empty description="加载中…" />;

  const sec = Math.floor(remaining / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  const urgent = remaining <= 10_000 && auction.status === 'LIVE';

  const STATUS: Record<string, { c: string; t: string }> = {
    LIVE: { c: 'red', t: '🔴 进行中' },
    PENDING: { c: 'purple', t: '⏳ 待开始' },
    ENDED: { c: 'default', t: '✅ 已结束' },
    CANCELED: { c: 'default', t: '🚫 已取消' },
  };

  const cancel = async () => {
    try {
      await api.cancelAuction(auctionId, '主播取消异常竞拍');
      message.success('已取消');
      reload();
    } catch (e: any) {
      message.error(e.message);
    }
  };
  const start = async () => {
    try {
      await api.startAuction(auctionId);
      message.success('已开拍');
      reload();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav('/')}>
          返回
        </Button>
        <div className="live-pill">
          <Badge status={connState === 'open' ? 'success' : 'warning'} text={connState === 'open' ? '实时连接' : '重连中'} />
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={20} align="middle">
          <Col flex="80px">
            <Image src={auction.product.image || ''} width={80} height={80} style={{ borderRadius: 12, objectFit: 'cover' }} preview={false} />
          </Col>
          <Col flex="auto">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0 }}>{auction.product.title}</h2>
              <Tag color={STATUS[auction.status]?.c}>{STATUS[auction.status]?.t}</Tag>
              {auction.delayCount > 0 && <Tag color="cyan">已延时 {auction.delayCount} 次</Tag>}
            </div>
            <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
              {auction.product.category} · 起拍 {formatMoney(auction.rules.startPrice)} · 加价 {formatMoney(auction.rules.bidIncrement)} ·{' '}
              {auction.rules.capPrice != null ? `封顶 ${formatMoney(auction.rules.capPrice)}` : '不封顶'}
            </div>
          </Col>
          <Col>
            {auction.status === 'PENDING' && (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={start} style={{ marginRight: 8 }}>
                立即开拍
              </Button>
            )}
            {(auction.status === 'LIVE' || auction.status === 'PENDING') && (
              <Popconfirm title="确定取消这场竞拍？" onConfirm={cancel} okText="取消竞拍" cancelText="再想想">
                <Button danger icon={<StopOutlined />}>
                  取消竞拍
                </Button>
              </Popconfirm>
            )}
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <div className="stat-card">
            <Statistic title={auction.status === 'ENDED' ? '成交价' : '当前价'} value={formatMoney(auction.status === 'ENDED' ? auction.finalPrice ?? auction.currentPrice : auction.currentPrice)} valueStyle={{ color: '#ffd76a' }} />
          </div>
        </Col>
        <Col span={6}>
          <div className="stat-card">
            <Statistic
              title={auction.status === 'PENDING' ? '距开拍' : '剩余时间'}
              value={auction.status === 'LIVE' || auction.status === 'PENDING' ? `${mm}:${ss}` : '—'}
              valueStyle={{ color: urgent ? '#fe2c55' : '#fff' }}
            />
          </div>
        </Col>
        <Col span={6}><div className="stat-card"><Statistic title="在线人数" value={online} valueStyle={{ color: '#25f4ee' }} /></div></Col>
        <Col span={6}><div className="stat-card"><Statistic title="出价 / 参与" value={`${auction.bidCount} / ${participants}`} valueStyle={{ color: '#8a5cff' }} /></div></Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="⚡ 实时出价流" styles={{ body: { maxHeight: 460, overflow: 'auto' } }}>
            {feed.length === 0 ? (
              <Empty description="暂无出价" />
            ) : (
              <List
                dataSource={feed}
                renderItem={(it, idx) => (
                  <List.Item className={idx === 0 ? 'bid-row-new' : ''}>
                    <List.Item.Meta
                      avatar={<Avatar style={{ background: 'linear-gradient(135deg,#8a5cff,#25f4ee)' }}>{it.nickname[0]}</Avatar>}
                      title={it.nickname}
                      description={new Date(it.ts).toLocaleTimeString('zh-CN')}
                    />
                    <span style={{ color: '#ffd76a', fontWeight: 700, fontSize: 16 }}>{formatMoney(it.amount)}</span>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="🏆 实时排行榜" styles={{ body: { maxHeight: 460, overflow: 'auto' } }}>
            {ranking.length === 0 ? (
              <Empty description="虚位以待" />
            ) : (
              <List
                dataSource={ranking}
                renderItem={(e) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar style={{ background: e.rank === 1 ? 'linear-gradient(135deg,#ffd76a,#fe2c55)' : '#333' }}>{e.rank}</Avatar>}
                      title={<span>{e.nickname} {e.isLeader && <Tag color="gold">领先</Tag>}</span>}
                    />
                    <span style={{ color: '#ffd76a', fontWeight: 700 }}>{formatMoney(e.bestAmount)}</span>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
