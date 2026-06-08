import type { PoolConnection } from 'mysql2/promise';
import { pool, query, execute } from '../infra/mysql.js';
import { rowToOrder } from './mappers.js';
import type { Order } from '@auction/shared';

export const orderRepo = {
  /** 创建订单（成交时，可在事务内）。auction_id 唯一键保证一场一单 */
  async create(
    input: {
      orderNo: string;
      auctionId: number;
      productId: number;
      productTitle: string;
      productImage: string | null;
      buyerId: number;
      buyerNickname: string;
      merchantId: number;
      amount: number;
    },
    conn?: PoolConnection
  ): Promise<number> {
    const exec = conn ?? pool;
    const [res]: any = await exec.execute(
      `INSERT INTO orders
        (order_no, auction_id, product_id, product_title, product_image,
         buyer_id, buyer_nickname, merchant_id, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.orderNo,
        input.auctionId,
        input.productId,
        input.productTitle,
        input.productImage,
        input.buyerId,
        input.buyerNickname,
        input.merchantId,
        input.amount,
      ]
    );
    return res.insertId;
  },

  async findById(id: number): Promise<Order | null> {
    const rows = await query('SELECT * FROM orders WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? rowToOrder(rows[0]) : null;
  },

  async findByAuction(auctionId: number): Promise<Order | null> {
    const rows = await query('SELECT * FROM orders WHERE auction_id = ? LIMIT 1', [auctionId]);
    return rows[0] ? rowToOrder(rows[0]) : null;
  },

  async listForUser(opts: {
    userId: number;
    role: 'MERCHANT' | 'BUYER';
    page: number;
    pageSize: number;
  }): Promise<{ items: Order[]; total: number }> {
    const col = opts.role === 'MERCHANT' ? 'merchant_id' : 'buyer_id';
    const countRows = await query(`SELECT COUNT(*) AS c FROM orders WHERE ${col} = ?`, [
      opts.userId,
    ]);
    const total = Number(countRows[0].c);
    const offset = (opts.page - 1) * opts.pageSize;
    const rows = await query(
      `SELECT * FROM orders WHERE ${col} = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
      [opts.userId, opts.pageSize, offset]
    );
    return { items: rows.map(rowToOrder), total };
  },

  async markPaid(id: number, buyerId: number): Promise<boolean> {
    const res = await execute(
      `UPDATE orders SET status='PAID', paid_at=NOW()
       WHERE id=? AND buyer_id=? AND status='PENDING_PAYMENT'`,
      [id, buyerId]
    );
    return res.affectedRows > 0;
  },
};
