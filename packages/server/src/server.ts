/**
 * 服务启动引导。
 *  1. 校验基础设施连通性（MySQL / Redis）
 *  2. 构建 Fastify 应用
 *  3. 在同一 HTTP Server 上挂载 WebSocket（路径 /ws）
 *  4. 启动竞拍引擎（恢复 LIVE 场次定时器 + 排行榜）
 *  5. 优雅停机
 */
import { WebSocketServer } from 'ws';
import { env } from './config/env.js';
import { logger } from './infra/logger.js';
import { pingMysql, closeMysql } from './infra/mysql.js';
import { pingRedis, closeRedis } from './infra/redis.js';
import { buildApp } from './app.js';
import { wsHub } from './ws/hub.js';
import { auctionEngine } from './services/auctionEngine.js';

async function main(): Promise<void> {
  await pingMysql();
  await pingRedis();

  const app = await buildApp();
  await app.ready();

  // 在 Fastify 的底层 HTTP server 上挂载 WebSocket
  const wss = new WebSocketServer({ server: app.server, path: '/ws' });
  wsHub.attach(wss);

  await auctionEngine.bootstrap();

  await app.listen({ port: env.port, host: env.host });
  logger.info(`🎯 实时竞拍大师后端已启动: http://${env.host}:${env.port}`);
  logger.info(`   WebSocket: ws://${env.host}:${env.port}/ws`);
  logger.info(`   健康检查: http://${env.host}:${env.port}/health`);

  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal}，开始优雅停机...`);
    try {
      auctionEngine.shutdown();
      wsHub.shutdown();
      wss.close();
      await app.close();
      await closeRedis();
      await closeMysql();
      logger.info('✅ 已优雅停机');
      process.exit(0);
    } catch (err: any) {
      logger.error({ err: err?.message }, '停机异常');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err: err?.message, stack: err?.stack }, '❌ 启动失败');
  process.exit(1);
});
