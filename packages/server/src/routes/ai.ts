import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { aiService } from '../services/aiService.js';
import { auctionRepo } from '../repositories/auctionRepo.js';
import { ok, parseBody, merchantOnly } from './helpers.js';

const describeSchema = z.object({
  title: z.string().min(1).max(128),
  category: z.string().min(1).max(32),
  keywords: z.string().max(200).optional(),
});

const commentarySchema = z.object({
  auctionId: z.number().int().positive(),
  scene: z.enum(['open', 'bid', 'ending', 'sold']),
  context: z.record(z.unknown()).optional(),
});

export default async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async () => ok({ available: aiService.available() }));

  /* AI 生成商品文案 + 推荐规则（商家） */
  app.post('/describe', { preHandler: merchantOnly }, async (req) => {
    const body = parseBody(describeSchema, req.body);
    const result = await aiService.describeProduct(body);
    return ok(result);
  });

  /* AI 主播话术 */
  app.post('/commentary', async (req) => {
    const body = parseBody(commentarySchema, req.body);
    // 注入竞拍上下文，丰富话术
    let context = body.context ?? {};
    const auction = await auctionRepo.findByIdWithProduct(body.auctionId);
    if (auction) {
      context = {
        ...context,
        商品: auction.product.title,
        当前价: auction.currentPrice / 100,
        出价次数: auction.bidCount,
        参与人数: auction.participantCount,
      };
    }
    const text = await aiService.commentary({ scene: body.scene, context });
    return ok({ text });
  });
}
