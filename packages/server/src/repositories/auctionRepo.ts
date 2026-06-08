import type { PoolConnection } from 'mysql2/promise';
import { pool, query } from '../infra/mysql.js';
import { rowToAuction, rowToProduct } from './mappers.js';
import { toMysqlDateTime } from '../utils/helpers.js';
import type {
  Auction,
  AuctionRules,
  AuctionStatus,
  AuctionWithProduct,
} from '@auction/shared';

type SettleReasonLiteral = 'TIME_UP' | 'CAP_REACHED' | 'MANUAL';

type Executor = Pick<PoolConnection, 'query' | 'execute'> | typeof pool;

const ofRow = rowToAuction;

export const auctionRepo = {
  async create(input: {
    productId: number;
    merchantId: number;
    rules: AuctionRules;
    startAt: Date;
    endAt: Date;
    status: AuctionStatus;
  }): Promise<Auction> {
    const r = input.rules;
    const [res]: any = await pool.execute(
      `INSERT INTO auctions
        (product_id, merchant_id, status,
         start_price, bid_increment, cap_price, duration_sec,
         anti_snipe_window_sec, delay_sec, max_delay_times,
         current_price, start_at, end_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.productId,
        input.merchantId,
        input.status,
        r.startPrice,
        r.bidIncrement,
        r.capPrice,
        r.durationSec,
        r.antiSnipeWindowSec,
        r.delaySec,
        r.maxDelayTimes,
        r.startPrice, // current_price 初始 = 起拍价
        toMysqlDateTime(input.startAt),
        toMysqlDateTime(input.endAt),
      ]
    );
    return (await this.findById(res.insertId))!;
  },

  async findById(id: number, exec: Executor = pool): Promise<Auction | null> {
    const [rows]: any = await exec.query('SELECT * FROM auctions WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? ofRow(rows[0]) : null;
  },

  /** 行级锁读取（FOR UPDATE），用于事务内 */
  async findByIdForUpdate(id: number, conn: PoolConnection): Promise<Auction | null> {
    const [rows]: any = await conn.query(
      'SELECT * FROM auctions WHERE id = ? LIMIT 1 FOR UPDATE',
      [id]
    );
    return rows[0] ? ofRow(rows[0]) : null;
  },

  async findByIdWithProduct(id: number): Promise<AuctionWithProduct | null> {
    const rows = await query(
      `SELECT a.*, p.id AS p_id, p.merchant_id AS p_merchant_id, p.title AS p_title,
              p.image AS p_image, p.description AS p_description, p.category AS p_category,
              p.created_at AS p_created_at, p.updated_at AS p_updated_at
       FROM auctions a JOIN products p ON a.product_id = p.id
       WHERE a.id = ? LIMIT 1`,
      [id]
    );
    if (!rows[0]) return null;
    return joinRow(rows[0]);
  },

  async list(opts: {
    status?: string;
    merchantId?: number;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuctionWithProduct[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status) {
      where.push('a.status = ?');
      params.push(opts.status);
    }
    if (opts.merchantId) {
      where.push('a.merchant_id = ?');
      params.push(opts.merchantId);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (opts.page - 1) * opts.pageSize;

    const countRows = await query(`SELECT COUNT(*) AS c FROM auctions a ${whereSql}`, params);
    const total = Number(countRows[0].c);

    const rows = await query(
      `SELECT a.*, p.id AS p_id, p.merchant_id AS p_merchant_id, p.title AS p_title,
              p.image AS p_image, p.description AS p_description, p.category AS p_category,
              p.created_at AS p_created_at, p.updated_at AS p_updated_at
       FROM auctions a JOIN products p ON a.product_id = p.id
       ${whereSql}
       ORDER BY FIELD(a.status,'LIVE','PENDING','ENDED','CANCELED'), a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, opts.pageSize, offset]
    );
    return { items: rows.map(joinRow), total };
  },

  /** 仅未开始(PENDING)的竞拍允许改规则 / 开始时间 */
  async updateRules(
    id: number,
    rules: Partial<AuctionRules>,
    startAt?: Date,
    endAt?: Date
  ): Promise<Auction | null> {
    const map: Record<string, unknown> = {
      start_price: rules.startPrice,
      bid_increment: rules.bidIncrement,
      cap_price: rules.capPrice,
      duration_sec: rules.durationSec,
      anti_snipe_window_sec: rules.antiSnipeWindowSec,
      delay_sec: rules.delaySec,
      max_delay_times: rules.maxDelayTimes,
    };
    const fields: string[] = [];
    const values: any[] = [];
    for (const [col, val] of Object.entries(map)) {
      if (val !== undefined) {
        fields.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (rules.startPrice !== undefined) {
      fields.push('current_price = ?');
      values.push(rules.startPrice);
    }
    if (startAt) {
      fields.push('start_at = ?');
      values.push(toMysqlDateTime(startAt));
    }
    if (endAt) {
      fields.push('end_at = ?');
      values.push(toMysqlDateTime(endAt));
    }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE auctions SET ${fields.join(', ')} WHERE id = ? AND status = 'PENDING'`,
      values
    );
    return this.findById(id);
  },

  /** PENDING → LIVE */
  async start(id: number, endAt: Date): Promise<boolean> {
    const [res]: any = await pool.execute(
      `UPDATE auctions
       SET status='LIVE', start_at=NOW(), end_at=?, version=version+1
       WHERE id=? AND status='PENDING'`,
      [toMysqlDateTime(endAt), id]
    );
    return res.affectedRows > 0;
  },

  /**
   * 核心：乐观锁出价更新。仅当 version 与预期一致且仍 LIVE 才成功。
   * 返回 affectedRows（1=成功，0=并发冲突或状态变更）。
   * 必须在事务连接上调用（与 bids insert 同事务）。
   */
  async applyBidOptimistic(
    conn: PoolConnection,
    params: {
      id: number;
      expectedVersion: number;
      newPrice: number;
      leaderId: number;
      leaderNickname: string;
      participantCount: number;
      newEndAt?: Date; // 若触发延时则推后
      delayInc: number; // 0 或 1
    }
  ): Promise<boolean> {
    const sets = [
      'current_price = ?',
      'leader_id = ?',
      'leader_nickname = ?',
      'bid_count = bid_count + 1',
      'participant_count = ?',
      'delay_count = delay_count + ?',
      'version = version + 1',
    ];
    const values: any[] = [
      params.newPrice,
      params.leaderId,
      params.leaderNickname,
      params.participantCount,
      params.delayInc,
    ];
    if (params.newEndAt) {
      sets.push('end_at = ?');
      values.push(toMysqlDateTime(params.newEndAt));
    }
    values.push(params.id, params.expectedVersion);
    const [res]: any = await conn.execute(
      `UPDATE auctions SET ${sets.join(', ')}
       WHERE id = ? AND version = ? AND status = 'LIVE'`,
      values
    );
    return res.affectedRows > 0;
  },

  /** 结束竞拍（成交或流拍） */
  async settle(
    id: number,
    input: {
      result: 'SOLD' | 'UNSOLD';
      reason: SettleReasonLiteral;
      winnerId: number | null;
      winnerNickname: string | null;
      finalPrice: number | null;
    },
    exec: Executor = pool
  ): Promise<boolean> {
    const [res]: any = await exec.execute(
      `UPDATE auctions
       SET status='ENDED', result=?, settle_reason=?, winner_id=?, winner_nickname=?,
           final_price=?, ended_at=NOW(), version=version+1
       WHERE id=? AND status='LIVE'`,
      [
        input.result,
        input.reason,
        input.winnerId,
        input.winnerNickname,
        input.finalPrice,
        id,
      ]
    );
    return res.affectedRows > 0;
  },

  /** 取消竞拍（PENDING 或 LIVE 均可） */
  async cancel(id: number): Promise<boolean> {
    const [res]: any = await pool.execute(
      `UPDATE auctions
       SET status='CANCELED', result='CANCELED', ended_at=NOW(), version=version+1
       WHERE id=? AND status IN ('PENDING','LIVE')`,
      [id]
    );
    return res.affectedRows > 0;
  },

  /** 引擎恢复：所有进行中的竞拍（用于服务重启后重建定时器） */
  async findAllLive(): Promise<Auction[]> {
    const rows = await query("SELECT * FROM auctions WHERE status='LIVE'");
    return rows.map(ofRow);
  },

  /** 引擎调度：到达开始时间但仍 PENDING 的竞拍 */
  async findPendingDue(): Promise<Auction[]> {
    const rows = await query(
      "SELECT * FROM auctions WHERE status='PENDING' AND start_at <= NOW()"
    );
    return rows.map(ofRow);
  },
};

/** 把带 p_* 前缀的联表行拆成 AuctionWithProduct */
function joinRow(r: any): AuctionWithProduct {
  const auction = ofRow(r);
  const product = rowToProduct({
    id: r.p_id,
    merchant_id: r.p_merchant_id,
    title: r.p_title,
    image: r.p_image,
    description: r.p_description,
    category: r.p_category,
    created_at: r.p_created_at,
    updated_at: r.p_updated_at,
  });
  return { ...auction, product };
}
