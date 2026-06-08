import type { PoolConnection } from 'mysql2/promise';
import { pool, query } from '../infra/mysql.js';
import { rowToBid } from './mappers.js';
import type { Bid } from '@auction/shared';

export const bidRepo = {
  /** 插入出价流水（事务内）。依赖唯一键 (auction_id, request_id) 做幂等兜底 */
  async insert(
    conn: PoolConnection,
    input: {
      auctionId: number;
      userId: number;
      nickname: string;
      amount: number;
      requestId: string;
    }
  ): Promise<number> {
    const [res]: any = await conn.execute(
      `INSERT INTO bids (auction_id, user_id, nickname, amount, request_id)
       VALUES (?, ?, ?, ?, ?)`,
      [input.auctionId, input.userId, input.nickname, input.amount, input.requestId]
    );
    return res.insertId;
  },

  /** 该用户在该场的历史最高出价 */
  async userBest(auctionId: number, userId: number): Promise<number | null> {
    const rows = await query(
      'SELECT MAX(amount) AS best FROM bids WHERE auction_id = ? AND user_id = ?',
      [auctionId, userId]
    );
    return rows[0]?.best == null ? null : Number(rows[0].best);
  },

  /** 去重参与人数 */
  async participantCount(auctionId: number, exec = pool): Promise<number> {
    const [rows]: any = await exec.query(
      'SELECT COUNT(DISTINCT user_id) AS c FROM bids WHERE auction_id = ?',
      [auctionId]
    );
    return Number(rows[0].c);
  },

  async list(opts: {
    auctionId: number;
    page: number;
    pageSize: number;
  }): Promise<{ items: Bid[]; total: number }> {
    const countRows = await query('SELECT COUNT(*) AS c FROM bids WHERE auction_id = ?', [
      opts.auctionId,
    ]);
    const total = Number(countRows[0].c);
    const offset = (opts.page - 1) * opts.pageSize;
    const rows = await query(
      `SELECT * FROM bids WHERE auction_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
      [opts.auctionId, opts.pageSize, offset]
    );
    return { items: rows.map(rowToBid), total };
  },
};
