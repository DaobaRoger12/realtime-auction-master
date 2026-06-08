/**
 * 路由通用工具：统一响应、认证守卫、分页与校验。
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodSchema } from 'zod';
import { verifyToken, type JwtPayload } from '../utils/security.js';
import type { ApiResponse } from '@auction/shared';
import { UserRole } from '@auction/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export function ok<T>(data: T, message = 'ok'): ApiResponse<T> {
  return { code: 0, message, data };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, 400, msg);
export const unauthorized = (msg = '未登录或登录已过期') => new HttpError(401, 401, msg);
export const forbidden = (msg = '无权限') => new HttpError(403, 403, msg);
export const notFound = (msg = '资源不存在') => new HttpError(404, 404, msg);
export const conflict = (msg = '操作冲突') => new HttpError(409, 409, msg);

/** 解析可选用户（不抛错） */
export function parseUser(req: FastifyRequest): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    return verifyToken(auth.slice(7));
  } catch {
    return null;
  }
}

/** 强制登录守卫（preHandler） */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const user = parseUser(req);
  if (!user) throw unauthorized();
  req.user = user;
}

/** 强制角色守卫 */
export function requireRole(role: UserRole) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = parseUser(req);
    if (!user) throw unauthorized();
    if (user.role !== role) throw forbidden(`仅 ${role} 可操作`);
    req.user = user;
  };
}

/** zod 校验 body */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw badRequest(msg || '参数错误');
  }
  return r.data;
}

export function parsePagination(query: any): { page: number; pageSize: number } {
  const page = Math.max(1, Number(query?.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize) || 20));
  return { page, pageSize };
}

export const merchantOnly = requireRole(UserRole.MERCHANT);
export const zodMoney = z.number().int().nonnegative();
