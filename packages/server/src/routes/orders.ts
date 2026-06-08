import type { FastifyInstance } from 'fastify';
import { orderRepo } from '../repositories/orderRepo.js';
import { ok, parsePagination, requireAuth, notFound, forbidden, conflict } from './helpers.js';

export default async function orderRoutes(app: FastifyInstance): Promise<void> {
  /* 我的订单（商家看卖出，买家看买入） */
  app.get('/mine', { preHandler: requireAuth }, async (req) => {
    const { page, pageSize } = parsePagination(req.query);
    const result = await orderRepo.listForUser({
      userId: req.user!.uid,
      role: req.user!.role,
      page,
      pageSize,
    });
    return ok({ items: result.items, total: result.total, page, pageSize });
  });

  app.get('/:id', { preHandler: requireAuth }, async (req) => {
    const id = Number((req.params as any).id);
    const order = await orderRepo.findById(id);
    if (!order) throw notFound('订单不存在');
    if (order.buyerId !== req.user!.uid && order.merchantId !== req.user!.uid) {
      throw forbidden();
    }
    return ok(order);
  });

  /* 通过竞拍查订单（结果页用） */
  app.get('/by-auction/:auctionId', { preHandler: requireAuth }, async (req) => {
    const auctionId = Number((req.params as any).auctionId);
    const order = await orderRepo.findByAuction(auctionId);
    if (!order) throw notFound('该竞拍暂无订单');
    return ok(order);
  });

  /* 模拟支付（买家） */
  app.post('/:id/pay', { preHandler: requireAuth }, async (req) => {
    const id = Number((req.params as any).id);
    const order = await orderRepo.findById(id);
    if (!order) throw notFound('订单不存在');
    if (order.buyerId !== req.user!.uid) throw forbidden('只能支付自己的订单');
    const paid = await orderRepo.markPaid(id, req.user!.uid);
    if (!paid) throw conflict('订单已支付或状态异常');
    return ok(await orderRepo.findById(id));
  });
}
