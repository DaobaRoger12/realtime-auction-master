import { query, execute } from '../infra/mysql.js';
import { rowToUser } from './mappers.js';
import type { User, UserRole } from '@auction/shared';

export interface UserWithHash extends User {
  passwordHash: string;
}

export const userRepo = {
  async findByUsername(username: string): Promise<UserWithHash | null> {
    const rows = await query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
    if (!rows[0]) return null;
    return { ...rowToUser(rows[0]), passwordHash: rows[0].password_hash };
  },

  async findById(id: number): Promise<User | null> {
    const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async create(input: {
    username: string;
    passwordHash: string;
    nickname: string;
    role: UserRole;
    avatar?: string | null;
  }): Promise<User> {
    const res = await execute(
      `INSERT INTO users (username, password_hash, nickname, role, avatar)
       VALUES (?, ?, ?, ?, ?)`,
      [input.username, input.passwordHash, input.nickname, input.role, input.avatar ?? null]
    );
    const created = await this.findById(res.insertId);
    return created!;
  },
};
