/**
 * 迁移脚本：建库 + 执行 schema.sql。
 * 用法：npm run db:migrate
 */
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../infra/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const schemaPath = resolve(__dirname, 'schema.sql');
  const sql = await readFile(schemaPath, 'utf8');

  // 先连接到 server（不指定库），确保数据库存在
  const root = await mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    multipleStatements: true,
  });
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.mysql.database}\` ` +
      `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await root.changeUser({ database: env.mysql.database });
  await root.query(sql);
  await root.end();

  logger.info('✅ 数据库迁移完成');
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err: err.message }, '❌ 迁移失败');
  process.exit(1);
});
