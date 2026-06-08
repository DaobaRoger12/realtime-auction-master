/**
 * MySQL 连接池。所有仓储层共用，支持事务。
 */
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const pool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  connectionLimit: env.mysql.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  // 金额用整数(分)，BigInt 不会溢出；时间统一交给应用层处理
  timezone: '+08:00',
  dateStrings: false,
  namedPlaceholders: true,
});

/** 便捷查询：返回行数组 */
export async function query<T = any>(sql: string, params?: Record<string, unknown> | unknown[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params as any);
  return rows as T[];
}

/** 便捷执行：返回结果元信息（insertId / affectedRows） */
export async function execute(
  sql: string,
  params?: Record<string, unknown> | unknown[]
): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params as any);
  return result as mysql.ResultSetHeader;
}

/** 在单连接上执行事务 */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function pingMysql(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    logger.info('✅ MySQL 连接成功');
  } finally {
    conn.release();
  }
}

export async function closeMysql(): Promise<void> {
  await pool.end();
}
