/**
 * 成交结算：把竞拍置为 ENDED，并在成交时生成订单（事务内，保证一致性）。
 * 封顶成交（出价路径内）与到时成交（引擎）共用本逻辑。
 */
import type { PoolConnection } from 'mysql2/promise';
import { auctionRepo } from '../repositories/auctionRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { genOrderNo } from '../utils/helpers.js';

/** 成交原因（与 DB ENUM / WS 协议一致的字符串字面量） */
export type SettleReasonLiteral = 'TIME_UP' | 'CAP_REACHED' | 'MANUAL';

export interface SettleInput {
  auctionId: number;
  productId: number;
  productTitle: string;
  productImage: string | null;
  merchantId: number;
  reason: SettleReasonLiteral;
  /** 中标者，null 表示流拍 */
  winnerId: number | null;
  winnerNickname: string | null;
  /** 成交价（分），流拍为 null */
  finalPrice: number | null;
}

export interface SettleOutcome {
  result: 'SOLD' | 'UNSOLD';
  orderNo: string | null;
}

/** 在给定事务连接上执行结算。返回成交结果与订单号 */
export async function performSettlement(
  conn: PoolConnection,
  input: SettleInput
): Promise<SettleOutcome> {
  const sold = input.winnerId != null && input.finalPrice != null;
  const result: 'SOLD' | 'UNSOLD' = sold ? 'SOLD' : 'UNSOLD';

  const ok = await auctionRepo.settle(
    input.auctionId,
    {
      result,
      reason: input.reason,
      winnerId: input.winnerId,
      winnerNickname: input.winnerNickname,
      finalPrice: input.finalPrice,
    },
    conn
  );
  // settle 内含 WHERE status='LIVE'，并发下只会有一方成功
  if (!ok) return { result, orderNo: null };

  let orderNo: string | null = null;
  if (sold) {
    orderNo = genOrderNo();
    await orderRepo.create(
      {
        orderNo,
        auctionId: input.auctionId,
        productId: input.productId,
        productTitle: input.productTitle,
        productImage: input.productImage,
        buyerId: input.winnerId!,
        buyerNickname: input.winnerNickname!,
        merchantId: input.merchantId,
        amount: input.finalPrice!,
      },
      conn
    );
  }
  return { result, orderNo };
}
