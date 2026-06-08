/**
 * 环境配置加载与校验。集中管理，避免散落的 process.env 调用。
 */
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 从 packages/server/.env 加载
loadDotenv({ path: resolve(__dirname, '../../.env') });

function str(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`缺少环境变量: ${key}`);
  return v;
}
function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`环境变量 ${key} 不是数字: ${v}`);
  return n;
}
function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  isProd: str('NODE_ENV', 'development') === 'production',
  port: num('PORT', 4000),
  host: str('HOST', '0.0.0.0'),

  jwt: {
    secret: str('JWT_SECRET', 'dev_secret'),
    expiresIn: str('JWT_EXPIRES_IN', '7d'),
  },

  mysql: {
    host: str('MYSQL_HOST', '127.0.0.1'),
    port: num('MYSQL_PORT', 3306),
    user: str('MYSQL_USER', 'auction'),
    password: str('MYSQL_PASSWORD', 'auction_pwd'),
    database: str('MYSQL_DATABASE', 'auction'),
    connectionLimit: num('MYSQL_CONNECTION_LIMIT', 20),
  },

  redis: {
    host: str('REDIS_HOST', '127.0.0.1'),
    port: num('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: num('REDIS_DB', 0),
  },

  ai: {
    enabled: bool('AI_ENABLED', true),
    baseUrl: str('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3'),
    apiKey: process.env.ARK_API_KEY ?? '',
    model: str('ARK_MODEL', ''),
  },
} as const;

export type Env = typeof env;
