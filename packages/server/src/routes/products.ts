import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { productRepo } from '../repositories/productRepo.js';
import { ok, parseBody, merchantOnly, notFound, forbidden } from './helpers.js';

const createSchema = z.object({
  title: z.string().min(1).max(128),
  image: z.string().max(512).nullable().optional(),
  description: z.string().min(1),
  category: z.string().min(1).max(32),
});

export default async function productRoutes(app: FastifyInstance): Promise<void> {
  // 商家创建商品
  app.post('/', { preHandler: merchantOnly }, async (req) => {
    const body = parseBody(createSchema, req.body);
    const product = await productRepo.create(req.user!.uid, body);
    return ok(product);
  });

  // 商家的商品列表
  app.get('/', { preHandler: merchantOnly }, async (req) => {
    const items = await productRepo.listByMerchant(req.user!.uid);
    return ok(items);
  });

  app.get('/:id', async (req) => {
    const id = Number((req.params as any).id);
    const product = await productRepo.findById(id);
    if (!product) throw notFound('商品不存在');
    return ok(product);
  });

  app.put('/:id', { preHandler: merchantOnly }, async (req) => {
    const id = Number((req.params as any).id);
    const product = await productRepo.findById(id);
    if (!product) throw notFound('商品不存在');
    if (product.merchantId !== req.user!.uid) throw forbidden();
    const body = parseBody(createSchema.partial(), req.body);
    const updated = await productRepo.update(id, body);
    return ok(updated);
  });
}
