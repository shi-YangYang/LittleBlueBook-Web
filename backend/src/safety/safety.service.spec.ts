import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from '../media/media.types.js';
import { SafetyService } from './safety.service.js';

const reporterId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const reportId = '00000000-0000-4000-8000-000000000003';

function serviceWith(overrides: Record<string, unknown> = {}) {
  const auth = {
    currentUser: jest.fn(async () => ({
      id: reporterId,
      email: 'fixture@example.invalid',
      nickname: '测试用户',
      avatar: { type: 'initial', value: '测' },
    })),
  };
  const transaction = {
    $queryRaw: jest.fn(async () => [{ id: reporterId }]),
    report: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn(async (input: { data: Record<string, unknown> }) => ({
        id: reportId,
        ...input.data,
        status: 'PENDING',
        createdAt: new Date('2026-08-10T00:00:00.000Z'),
      })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: {
      findFirst: jest.fn(async () => ({ id: targetId })),
      findUnique: jest.fn(async () => ({
        id: targetId,
        role: 'USER',
        status: 'ACTIVE',
      })),
      update: jest.fn(async () => ({})),
    },
    userBlock: {
      upsert: jest.fn(async () => ({})),
      count: jest.fn(async () => 0),
    },
    userFollow: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    notification: { updateMany: jest.fn(async () => ({ count: 4 })) },
    note: { findFirst: jest.fn(async () => ({ authorId: targetId })) },
    noteComment: { findFirst: jest.fn(async () => ({ authorId: targetId })) },
    moderationAudit: { create: jest.fn(async () => ({})) },
    ...overrides,
  };
  const prisma = {
    ...transaction,
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => unknown) =>
        operation(transaction),
    ),
  };
  const service = new SafetyService(
    auth as unknown as AuthService,
    prisma as unknown as PrismaService,
    {
      publicUrl: jest.fn(),
      createObjectKey: jest.fn(),
    } as unknown as MediaStorage,
  );
  return { service, auth, prisma, transaction };
}

describe('SafetyService', () => {
  it('returns an existing pending report without consuming the rolling quota', async () => {
    const { service, transaction } = serviceWith();
    (transaction.report.findFirst as jest.Mock).mockResolvedValue({
      id: reportId,
      reporterId,
      targetType: 'NOTE',
      targetId,
      reason: 'SPAM',
      details: null,
      status: 'PENDING',
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    });

    await expect(
      service.createReport('session', {
        targetType: 'NOTE',
        targetId,
        reason: 'SPAM',
      }),
    ).resolves.toMatchObject({ id: reportId, result: '处理中' });
    expect(transaction.report.count).not.toHaveBeenCalled();
    expect(transaction.report.create).not.toHaveBeenCalled();
  });

  it('rejects an eleventh new report in the database-backed rolling window', async () => {
    const { service, transaction } = serviceWith();
    transaction.report.count.mockResolvedValue(10);

    await expect(
      service.createReport('session', {
        targetType: 'NOTE',
        targetId,
        reason: 'SPAM',
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ code: 'REPORT_RATE_LIMITED' }),
    });
    expect(transaction.report.create).not.toHaveBeenCalled();
  });

  it('atomically creates a directional block, removes both follows and suppresses notifications', async () => {
    const { service, prisma, transaction } = serviceWith();

    await expect(service.block('session', targetId)).resolves.toEqual({
      blocked: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.userBlock.upsert).toHaveBeenCalled();
    expect(transaction.userFollow.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { followerId: reporterId, followedId: targetId },
          { followerId: targetId, followedId: reporterId },
        ],
      },
    });
    expect(transaction.notification.updateMany).toHaveBeenCalled();
  });

  it('returns a non-disclosing 404 for a non-admin moderation request', async () => {
    const { service } = serviceWith();
    await expect(service.adminReports('session', {})).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({ code: 'PAGE_NOT_FOUND' }),
    });
  });
});
