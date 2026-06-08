import { query, execute } from '../infra/mysql.js';
import { rowToProduct } from './mappers.js';
import type { CreateProductRequest, Product, UpdateProductRequest } from '@auction/shared';

export const productRepo = {
  async create(merchantId: number, input: CreateProductRequest): Promise<Product> {
    const res = await execute(
      `INSERT INTO products (merchant_id, title, image, description, category)
       VALUES (?, ?, ?, ?, ?)`,
      [merchantId, input.title, input.image ?? null, input.description, input.category]
    );
    return (await this.findById(res.insertId))!;
  },

  async findById(id: number): Promise<Product | null> {
    const rows = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? rowToProduct(rows[0]) : null;
  },

  async listByMerchant(merchantId: number): Promise<Product[]> {
    const rows = await query(
      'SELECT * FROM products WHERE merchant_id = ? ORDER BY id DESC',
      [merchantId]
    );
    return rows.map(rowToProduct);
  },

  async update(id: number, input: UpdateProductRequest): Promise<Product | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [col, key] of [
      ['title', 'title'],
      ['image', 'image'],
      ['description', 'description'],
      ['category', 'category'],
    ] as const) {
      if (input[key] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(input[key]);
      }
    }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    await execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  },
};
