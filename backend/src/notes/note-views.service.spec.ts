import type { ConfigService } from '@nestjs/config';

import type { AuthService } from '../auth/auth.service.js';
import type { ChannelsService } from '../channels/channels.service.js';
import type { AppEnvironment } from '../config/environment.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { ImageValidatorService } from '../media/image-validator.service.js';
import type { MediaStorage } from '../media/media.types.js';
import type { RedisService } from '../redis/redis.service.js';
import { NotesService } from './notes.service.js';

const noteId = '00000000-0000-4000-8000-000000000401';
const authorId = '00000000-0000-4000-8000-000000000402';

function createService(options: { viewerId?: string; changed?: boolean } = {}) {
  const transaction = {
    note: {
      findUnique: jest.fn(async () => ({ authorId, viewCount: 7 })),
      update: jest.fn(async () => ({ viewCount: 8 })),
    },
    $queryRaw: jest.fn(async () =>
      options.changed === false ? [] : [{ noteId }],
    ),
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (tx: unknown) => unknown) =>
      operation(transaction),
    ),
  };
  const auth = {
    currentUser: jest.fn(async () =>
      options.viewerId
        ? {
            id: options.viewerId,
            email: 'private@example.test',
            nickname: '访客',
            avatar: { type: 'initial', value: '访' },
          }
        : null,
    ),
  };
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'COOKIE_SECURE'
        ? false
        : 'unit-test-view-secret-at-least-32-characters',
    ),
  };
  const service = new NotesService(
    auth as unknown as AuthService,
    {} as ChannelsService,
    prisma as unknown as PrismaService,
    {} as ImageValidatorService,
    {} as MediaStorage,
    { cleanupQueuedObjects: jest.fn(async () => undefined) } as never,
    {} as RedisService,
    config as unknown as ConfigService<AppEnvironment, true>,
  );
  return { service, transaction };
}

describe('SPEC-011 note views', () => {
  it('hashes an anonymous visitor before the atomic PostgreSQL upsert', async () => {
    const { service, transaction } = createService();
    const rawVisitor = 'raw-anonymous-cookie-value';
    const result = await service.recordView(undefined, noteId, rawVisitor);

    expect(result).toMatchObject({ counted: true, viewCount: 8 });
    expect(result.visitorIdToSet).toBeNull();
    expect(transaction.note.update).toHaveBeenCalledWith({
      where: { id: noteId },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    expect(JSON.stringify(transaction.$queryRaw.mock.calls)).not.toContain(
      rawVisitor,
    );
  });

  it('does not count the author and does not write a deduplication subject', async () => {
    const { service, transaction } = createService({ viewerId: authorId });
    const result = await service.recordView('session', noteId, undefined);

    expect(result).toMatchObject({ counted: false, viewCount: 7 });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.note.update).not.toHaveBeenCalled();
  });

  it('returns the authoritative count without incrementing inside the 30-minute window', async () => {
    const { service, transaction } = createService({ changed: false });
    const result = await service.recordView(undefined, noteId, 'same-visitor');

    expect(result).toMatchObject({ counted: false, viewCount: 7 });
    expect(transaction.note.update).not.toHaveBeenCalled();
  });
});
