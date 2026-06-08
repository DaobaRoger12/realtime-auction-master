import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userRepo } from '../repositories/userRepo.js';
import { hashPassword, verifyPassword, signToken } from '../utils/security.js';
import { ok, parseBody, requireAuth, badRequest, unauthorized, conflict } from './helpers.js';
import { UserRole } from '@auction/shared';

const registerSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(64),
  nickname: z.string().min(1).max(32),
  role: z.nativeEnum(UserRole),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (req) => {
    const body = parseBody(registerSchema, req.body);
    const exist = await userRepo.findByUsername(body.username);
    if (exist) throw conflict('用户名已被占用');
    const user = await userRepo.create({
      username: body.username,
      passwordHash: await hashPassword(body.password),
      nickname: body.nickname,
      role: body.role,
    });
    const token = signToken({
      uid: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
    });
    return ok({ token, user });
  });

  app.post('/login', async (req) => {
    const body = parseBody(loginSchema, req.body);
    const found = await userRepo.findByUsername(body.username);
    if (!found) throw unauthorized('用户名或密码错误');
    const valid = await verifyPassword(body.password, found.passwordHash);
    if (!valid) throw unauthorized('用户名或密码错误');
    const { passwordHash, ...user } = found;
    const token = signToken({
      uid: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
    });
    return ok({ token, user });
  });

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const user = await userRepo.findById(req.user!.uid);
    if (!user) throw unauthorized();
    return ok(user);
  });
}
