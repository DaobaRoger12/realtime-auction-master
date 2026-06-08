// 等待 MySQL / Redis 容器健康后再继续，避免 setup 时迁移失败
import { execSync } from 'node:child_process';

const services = ['auction-mysql', 'auction-redis'];
const timeoutMs = 90_000;
const start = Date.now();

function health(name) {
  try {
    return execSync(
      `docker inspect --format "{{.State.Health.Status}}" ${name}`,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
      .toString()
      .trim();
  } catch {
    return 'missing';
  }
}

console.log('⏳ 等待基础设施 (MySQL / Redis) 就绪...');
while (Date.now() - start < timeoutMs) {
  const statuses = services.map((s) => [s, health(s)]);
  const allHealthy = statuses.every(([, st]) => st === 'healthy');
  process.stdout.write(
    `\r  ${statuses.map(([s, st]) => `${s}:${st}`).join('  ')}        `
  );
  if (allHealthy) {
    console.log('\n✅ 基础设施已就绪');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

console.error('\n❌ 等待超时，请检查 `docker compose ps`');
process.exit(1);
