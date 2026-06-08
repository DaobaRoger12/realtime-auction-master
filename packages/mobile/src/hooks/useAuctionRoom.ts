/**
 * useAuctionRoom —— 订阅单个竞拍房间的实时状态。
 *
 * 负责：join/leave、消化快照与各类事件、维护当前价/排行榜/在线数/我的状态，
 * 并在「领先 / 被超越 / 延时 / 结束」时触发音效与动画反馈（竞价氛围核心）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../store/auth';
import { sound } from '../lib/sound';
import {
  WsServerEvent,
  type AuctionWithProduct,
  type RankingEntry,
  type SnapshotPayload,
  type BidAcceptedPayload,
  type BidRejectedPayload,
  type AuctionDelayedPayload,
  type AuctionEndedPayload,
} from '@auction/shared';

export type FlashKind = 'lead' | 'overtaken' | 'bid' | 'delay' | null;

export interface RoomState {
  auction: AuctionWithProduct | null;
  ranking: RankingEntry[];
  onlineCount: number;
  participantCount: number;
  myBest: number | null;
  iAmLeading: boolean;
  ended: AuctionEndedPayload | null;
  canceled: { reason: string } | null;
  loading: boolean;
}

export interface RoomFlash {
  kind: FlashKind;
  key: number;
  /** 最近一次被接受的出价（用于飘价动画） */
  lastBid?: BidAcceptedPayload;
}

let reqCounter = 0;
function genRequestId(uid: number): string {
  reqCounter += 1;
  return `${uid}-${Date.now()}-${reqCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAuctionRoom(auctionId: number) {
  const { socket, state: connState } = useSocket();
  const myId = useAuth((s) => s.user?.id ?? null);

  const [state, setState] = useState<RoomState>({
    auction: null,
    ranking: [],
    onlineCount: 0,
    participantCount: 0,
    myBest: null,
    iAmLeading: false,
    ended: null,
    canceled: null,
    loading: true,
  });
  const [flash, setFlash] = useState<RoomFlash>({ kind: null, key: 0 });
  const [reject, setReject] = useState<(BidRejectedPayload & { key: number }) | null>(null);

  const prevLeaderRef = useRef<number | null>(null);
  const flashKeyRef = useRef(0);

  const triggerFlash = useCallback((kind: FlashKind, lastBid?: BidAcceptedPayload) => {
    flashKeyRef.current += 1;
    setFlash({ kind, key: flashKeyRef.current, lastBid });
  }, []);

  useEffect(() => {
    if (!auctionId) return;
    const offs: Array<() => void> = [];

    offs.push(
      socket.on(WsServerEvent.SNAPSHOT, (d: SnapshotPayload) => {
        if (d.auction.id !== auctionId) return;
        prevLeaderRef.current = d.auction.leaderId;
        setState((s) => ({
          ...s,
          auction: d.auction as AuctionWithProduct,
          ranking: d.ranking,
          onlineCount: d.onlineCount,
          participantCount: d.auction.participantCount,
          myBest: d.myBestAmount,
          iAmLeading: d.iAmLeading,
          loading: false,
        }));
      })
    );

    offs.push(
      socket.on(WsServerEvent.BID_ACCEPTED, (d: BidAcceptedPayload) => {
        if (d.auctionId !== auctionId) return;
        const wasLeading = prevLeaderRef.current === myId;
        const nowLeading = d.leaderId === myId;
        prevLeaderRef.current = d.leaderId;

        // 氛围反馈
        if (nowLeading) {
          sound.lead();
          triggerFlash('lead', d);
        } else if (wasLeading && !nowLeading) {
          sound.overtaken();
          triggerFlash('overtaken', d);
        } else {
          sound.bid();
          triggerFlash('bid', d);
        }

        setState((s) => ({
          ...s,
          ranking: d.ranking,
          participantCount: d.participantCount,
          iAmLeading: nowLeading,
          myBest:
            d.userId === myId ? d.amount : s.myBest,
          auction: s.auction
            ? {
                ...s.auction,
                currentPrice: d.currentPrice,
                leaderId: d.leaderId,
                leaderNickname: d.nickname,
                bidCount: d.bidCount,
                participantCount: d.participantCount,
                version: d.version,
                endAt: d.endAt,
              }
            : s.auction,
        }));
      })
    );

    offs.push(
      socket.on(WsServerEvent.BID_REJECTED, (d: BidRejectedPayload) => {
        if (d.auctionId !== auctionId) return;
        flashKeyRef.current += 1;
        setReject({ ...d, key: flashKeyRef.current });
      })
    );

    offs.push(
      socket.on(WsServerEvent.AUCTION_DELAYED, (d: AuctionDelayedPayload) => {
        if (d.auctionId !== auctionId) return;
        sound.delay();
        triggerFlash('delay');
        setState((s) => ({
          ...s,
          auction: s.auction
            ? { ...s.auction, endAt: d.endAt, delayCount: d.delayCount }
            : s.auction,
        }));
      })
    );

    offs.push(
      socket.on(WsServerEvent.AUCTION_STARTED, (d: any) => {
        if (d.auctionId !== auctionId) return;
        setState((s) => ({
          ...s,
          auction: s.auction
            ? { ...s.auction, status: 'LIVE' as any, endAt: d.endAt }
            : s.auction,
        }));
      })
    );

    offs.push(
      socket.on(WsServerEvent.AUCTION_ENDED, (d: AuctionEndedPayload) => {
        if (d.auctionId !== auctionId) return;
        sound.end();
        setState((s) => ({
          ...s,
          ended: d,
          auction: s.auction
            ? {
                ...s.auction,
                status: 'ENDED' as any,
                result: d.result as any,
                finalPrice: d.finalPrice,
                winnerId: d.winnerId,
                winnerNickname: d.winnerNickname,
              }
            : s.auction,
        }));
      })
    );

    offs.push(
      socket.on(WsServerEvent.AUCTION_CANCELED, (d: any) => {
        if (d.auctionId !== auctionId) return;
        setState((s) => ({
          ...s,
          canceled: { reason: d.reason },
          auction: s.auction ? { ...s.auction, status: 'CANCELED' as any } : s.auction,
        }));
      })
    );

    offs.push(
      socket.on(WsServerEvent.PRESENCE, (d: any) => {
        if (d.auctionId !== auctionId) return;
        setState((s) => ({
          ...s,
          onlineCount: d.onlineCount,
          participantCount: d.participantCount,
        }));
      })
    );

    socket.join(auctionId);
    return () => {
      offs.forEach((f) => f());
      socket.leave(auctionId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId, socket, myId, triggerFlash]);

  const bid = useCallback(
    (amount: number) => {
      if (myId == null) return;
      socket.bid(auctionId, amount, genRequestId(myId));
    },
    [auctionId, socket, myId]
  );
  const quickBid = useCallback(() => {
    if (myId == null) return;
    socket.quickBid(auctionId, genRequestId(myId));
  }, [auctionId, socket, myId]);

  return { state, flash, reject, bid, quickBid, connState, serverNow: () => socket.serverNow() };
}
