/**
 * 通用小工具：ID、时间、订单号。
 */
import { randomUUID } from 'node:crypto';

export const uuid = (): string => randomUUID();

/** 生成订单号：年月日时分秒 + 6 位随机 */
export function genOrderNo(): string {
  const d = new Date();
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `AU${stamp}${rand}`;
}

export const now = (): number => Date.now();

/** 转 MySQL DATETIME 字符串（本地时区）：YYYY-MM-DD HH:mm:ss */
export function toMysqlDateTime(input: Date | number | string): string {
  const d = new Date(input);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
