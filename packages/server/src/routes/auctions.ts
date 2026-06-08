import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auctionRepo } from '../repositories/auctionRepo.js';
import { productRepo } from '../repositories/productRepo.js';
import { bidRepo } from '../repositories/bidRepo.js';
import { ranking } from '../services/ranking.js';
import { presence } from '../services/presence.js';
import { auctionEngine } from '../services/auctionEngine.js';
import {
  ok,
  parseBody,
  parsePagination,
  merchantOnly,
  parseUser,
  notFound,
  forbidden,
  badRequest,
  conflict,
} from './helpers.js';
import { validateRules, AuctionStatus } from '@auction/shared';

const rulesSchema = z.object({
  startPrice: z.number().int().nonnegative(),
  bidIncrement: z.number().int().positive(),
  capPrice: z.number().int().positive().nullable(),
  durationSec: z.number().int().min(10).max(86400),
  antiSnipeWindowSec: z.number().int().min(0).max(300),
  delaySec: z.number().int().min(5).max(120),
  maxDelayTimes: z.number().int().min(0).max(100),
});

const createSchema = z.object({
  productId: z.number().int().positive().optional(),
  product: z
    .object({
      title: z.string().min(1).max(128),
      image: z.string().max(512).nullable().optional(),
      description: z.string().min(1),
      category: z.string().min(1).max(32),
    })
    .optional(),
  rules: rulesSchema,
  startAt: z.string().datetime().optional(),
});

export default async function auctionRoutes(app: FastifyInstance): Promise<void> {
  /* 创建竞拍（商家） */
  app.post('/', { preHandler: merchantOnly }, async (req) => {
    const body = parseBody(createSchema, req.body);
    const merchantId = req.user!.uid;

    const ruleErrors = validateRules(body.rules);
    if (ruleErrors.length) throw badRequest(ruleErrors.join('；'));

    // 解析商品：复用已有 或 同时新建
    let productId = body.productId;
    if (!productId) {
      if (!body.product) throw badRequest('需提供 productId 或 product');
      const created = await productRepo.create(merchantId, body.product);
      productId = created.id;
    } else {
      const product = await productRepo.findById(productId);
      if (!product) throw notFound('商品不存在');
      if (product.merchantId !== merchantId) throw forbidden('无权使用该商品');
    }

    const startAt = body.startAt ? new Date(body.startAt) : new Date();
    const endAt = new Date(startAt.getTime() + body.rules.durationSec * 1000);
    const auction = await auctionRepo.create({
      productId,
      merchantId,
      rules: body.rules,
      startAt,
      endAt,
      status: AuctionStatus.PENDING,
    });

    // 到点即开：startAt 已到则立即开拍，否则安排定时器
    if (startAt.getTime() <= Date.now() + 500) {
      await auctionEngine.startAuction(auction.id);
    } else {
      auctionEngine.schedulePending(auction.id, startAt.getTime());
    }
    const full = await auctionRepo.findByIdWithProduct(auction.id);
    return ok(full);
  });

  /* 列表（公开，可按 status / merchantId 过滤） */
  app.get('/', async (req) => {
    const q = req.query as any;
    const { page, pageSize } = parsePagination(q);
    const result = await auctionRepo.list({
      status: q.status,
      merchantId: q.merchantId ? Number(q.merchantId) : undefined,
      page,
      pageSize,
    });
    return ok({ items: result.items, total: result.total, page, pageSize });
  });

  /* 我（商家）的竞拍 */
  app.get('/mine', { preHandler: merchantOnly }, async (req) => {
    const q = req.query as any;
    const { page, pageSize } = parsePagination(q);
    const result = await auctionRepo.list({
      merchantId: req.user!.uid,
      status: q.status,
      page,
      pageSize,
    });
    return ok({ items: result.items, total: result.total, page, pageSize });
  });

  /* 详情（含实时在线人数 + 排行榜） */
  app.get('/:id', async (req) => {
    const id = Number((req.params as any).id);
    const auction = await auctionRepo.findByIdWithProduct(id);
    if (!auction) throw notFound('竞拍不存在');
    const [online, rank] = await Promise.all([
      presence.count(id),
      ranking.top(id, 10),
    ]);
    return ok({ ...auction, onlineCount: online, ranking: rank });
  });

  /* 修改规则 / 开始时间（仅 PENDING） */
  app.put('/:id/rules', { preHandler: merchantOnly }, async (req) => {
    const id = Number((req.params as any).id);
    const auction = await auctionRepo.findById(id);
    if (!auction) throw notFound('竞拍不存在');
    if (auction.merchantId !== req.user!.uid) throw forbidden();
    if (auction.status !== AuctionStatus.PENDING) {
      throw conflict('仅未开始的竞拍可修改规则');
    }
    const body = parseBody(
      z.object({ rules: rulesSchema.partial().optional(), startAt: z.string().datetime().optional() }),
      req.body
    );
    const merged = { ...auction.rules, ...(body.rules ?? {}) };
    const errs = validateRules(merged);
    if (errs.length) throw badRequest(errs.join('；'));

    const startAt = body.startAt ? new Date(body.startAt) : new Date(auction.startAt);
    const endAt = new Date(startAt.getTime() + merged.durationSec * 1000);
    const updated = await auctionRepo.updateRules(id, body.rules ?? {}, startAt, endAt);

    if (body.startAt) auctionEngine.schedulePending(id, startAt.getTime());
    return ok(updated);
  });

  /* 手动开拍（商家） */
  app.post('/:id/start', { preHandler: merchantOnly }, async (req) => {
    const id = Number((req.params as any).id);
    const auction = await auctionRepo.findById(id);
    if (!auction) throw notFound('竞拍不存在');
    if (auction.merchantId !== req.user!.uid) throw forbidden();
    if (auction.status !== AuctionStatus.PENDING) throw conflict('竞拍非待开始状态');
    await auctionEngine.startAuction(id);
    return ok(await auctionRepo.findByIdWithProduct(id));
  });

  /* 取消竞拍（商家，PENDING/LIVE 均可） */
  app.post('/:id/cancel', { preHandler: merchantOnly }, async (req) => {
    const id = Number((req.params as any).id);
    const reason = (req.body as any)?.reason || '主播取消异常竞拍';
    const auction = await auctionRepo.findById(id);
    if (!auction) throw notFound('竞拍不存在');
    if (auction.merchantId !== req.user!.uid) throw forbidden();
    const okCancel = await auctionRepo.cancel(id);
    if (!okCancel) throw conflict('当前状态无法取消');
    await auctionEngine.onCanceled(id, reason);
    return ok(await auctionRepo.findByIdWithProduct(id));
  });

  /* 出价历史 */
  app.get('/:id/bids', async (req) => {
    const id = Number((req.params as any).id);
    const { page, pageSize } = parsePagination(req.query);
    const result = await bidRepo.list({ auctionId: id, page, pageSize });
    return ok({ items: result.items, total: result.total, page, pageSize });
  });

  /* 实时排行榜 */
  app.get('/:id/ranking', async (req) => {
    const id = Number((req.params as any).id);
    const q = req.query as any;
    const top = await ranking.top(id, Math.min(50, Number(q.limit) || 10));
    // 顺带返回「我的最高出价」
    const user = parseUser(req);
    const myBest = user ? await ranking.userBest(id, user.uid) : null;
    return ok({ ranking: top, myBestAmount: myBest });
  });
}
