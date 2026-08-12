import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';

const argumentsInput = process.argv.slice(2);
if (argumentsInput[0] === '--') argumentsInput.shift();
const [action, emailInput] = argumentsInput;
if (!['grant', 'revoke'].includes(action ?? '') || !emailInput) {
  console.error(
    '用法：pnpm --filter backend admin:role -- <grant|revoke> <用户邮箱>',
  );
  process.exitCode = 1;
} else {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://littlebluebook:littlebluebook-local@127.0.0.1:5432/littlebluebook';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const user = await prisma.user.findUnique({
      where: { email: emailInput.trim().toLowerCase() },
      select: { id: true, role: true },
    });
    if (!user) throw new Error('目标用户不存在');
    const role = action === 'grant' ? 'ADMIN' : 'USER';
    if (user.role !== role) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role, authVersion: { increment: 1 } },
      });
    }
    console.log(`角色已更新：用户 ${user.id} -> ${role}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '角色更新失败');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
