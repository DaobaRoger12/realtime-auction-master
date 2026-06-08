/**
 * 统一日志。开发环境用 pino-pretty 彩色输出，生产环境输出 JSON 便于采集。
 */
import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino(
  env.isProd
    ? { level: 'info' }
    : {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
);

export type Logger = typeof logger;
