/**
 * Fastify 应用装配：CORS、统一错误处理、路由注册、健康检查（可观测性）。
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { logger } from './infra/logger.js';
import { redis } from './infra/redis.js';
import { pool } from './infra/mysql.js';
import { wsHub } from './ws/hub.js';
import { HttpError } from './routes/helpers.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import auctionRoutes from './routes/auctions.js';
import orderRoutes from './routes/orders.js';
import aiRoutes from './routes/ai.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger as any, trustProxy: true });

  await app.register(cors, { origin: true, credentials: true });

  // 统一错误处理
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) {
      reply.status(err.status).send({ code: err.code, message: err.message, data: null });
      return;
    }
    logger.error({ err: err.message, stack: err.stack }, '未捕获的请求错误');
    reply.status(500).send({ code: 500, message: '服务器内部错误', data: null });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ code: 404, message: '接口不存在', data: null });
  });

  // 健康检查 / 可观测性
  app.get('/health', async () => {
    const checks = { mysql: false, redis: false };
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      checks.mysql = true;
    } catch {
      /* ignore */
    }
    try {
      checks.redis = (await redis.ping()) === 'PONG';
    } catch {
      /* ignore */
    }
    return {
      code: 0,
      message: 'ok',
      data: {
        status: checks.mysql && checks.redis ? 'healthy' : 'degraded',
        ...checks,
        ws: wsHub.stats(),
        time: new Date().toISOString(),
      },
    };
  });

  // 业务路由（统一 /api 前缀）
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(productRoutes, { prefix: '/api/products' });
  await app.register(auctionRoutes, { prefix: '/api/auctions' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(aiRoutes, { prefix: '/api/ai' });

  return app;
}
