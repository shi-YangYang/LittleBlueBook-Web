import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage, ValidatedImage } from '../media/media.types.js';
import type { AvatarProcessorService } from './avatar-processor.service.js';
import type { UpdateProfileSettingsDto } from './dto/update-profile-settings.dto.js';
import { calculateAge } from './profile-age.js';
import { ProfileService } from './profile.service.js';

const userId = '00000000-0000-4000-8000-000000000201';
const profileVersion = '00000000-0000-4000-8000-000000000202';
const oldObjectKey = `${'a'.repeat(48)}.webp`;
const newObjectKey = `${'b'.repeat(48)}.webp`;

const current = {
  nickname: '资料蓝友',
  littleBlueBookId: '0000000201',
  email: 'private@example.com',
  gender: 'PRIVATE' as const,
  birthDate: new Date('2000-02-29T00:00:00.000Z'),
  showAge: false,
  bio: null,
  avatarObjectKey: oldObjectKey,
  profileVersion,
};

function input(
  overrides: Partial<UpdateProfileSettingsDto> = {},
): UpdateProfileSettingsDto {
  return {
    nickname: '新资料蓝友',
    gender: 'MALE',
    birthDate: '2000-02-29',
    showAge: 'true',
    bio: '纯文本简介',
    avatarAction: 'keep',
    profileVersion,
    ...overrides,
  };
}

function dependencies(
  updateCount = 1,
  deleteFails = false,
  cleanupUpdateFails = false,
) {
  const auth = {
    currentUser: jest.fn(async () => ({
      id: userId,
      email: current.email,
      nickname: current.nickname,
    })),
  };
  const saved = {
    ...current,
    nickname: '新资料蓝友',
    gender: 'MALE' as const,
    showAge: true,
    bio: '纯文本简介',
    avatarObjectKey: newObjectKey,
    profileVersion: '00000000-0000-4000-8000-000000000203',
  };
  const transaction = {
    user: {
      updateMany: jest.fn(async () => ({ count: updateCount })),
      findUnique: jest.fn(async () => saved),
    },
    avatarCleanup: {
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const storedKeys = new Set<string>();
  const prisma = {
    user: {
      findUnique: jest.fn(async () => current),
      count: jest.fn(async () => 0),
    },
    noteImage: {
      count: jest.fn(async () => 0),
    },
    avatarCleanup: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
      upsert: jest.fn(async () => ({})),
      updateMany: jest.fn(
        async (operation: { data?: { attempts?: unknown } }) => {
          if (cleanupUpdateFails && operation.data?.attempts) {
            throw new Error('database unavailable');
          }
          return { count: 1 };
        },
      ),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => unknown) =>
        operation(transaction),
    ),
  };
  const processed: ValidatedImage = {
    buffer: Buffer.from('processed'),
    byteSize: 9,
    width: 512,
    height: 512,
    mimeType: 'image/webp',
    extension: 'webp',
  };
  const avatarProcessor = {
    process: jest.fn(async () => processed),
  };
  const media = {
    save: jest.fn(async () => [
      {
        objectKey: newObjectKey,
        byteSize: 9,
        width: 512,
        height: 512,
        mimeType: 'image/webp' as const,
      },
    ]),
    createObjectKey: jest.fn(() => newObjectKey),
    saveAt: jest.fn(async () => {
      storedKeys.add(newObjectKey);
      return {
        objectKey: newObjectKey,
        byteSize: 9,
        width: 512,
        height: 512,
        mimeType: 'image/webp' as const,
      };
    }),
    deleteMany: jest.fn(async () => undefined),
    deleteStrict: jest.fn(async (objectKey: string) => {
      if (deleteFails) throw new Error('private storage path');
      storedKeys.delete(objectKey);
    }),
    read: jest.fn(async (objectKey: string) =>
      storedKeys.has(objectKey) ? Buffer.from('stored') : null,
    ),
    publicUrl: jest.fn((key: string) => `/media/${key}`),
  };
  return {
    service: new ProfileService(
      auth as unknown as AuthService,
      prisma as unknown as PrismaService,
      avatarProcessor as unknown as AvatarProcessorService,
      media as unknown as MediaStorage,
    ),
    prisma,
    transaction,
    avatarProcessor,
    media,
    storedKeys,
  };
}

describe('profile settings domain', () => {
  it('calculates birthdays and leap-day ages using pure UTC dates', () => {
    const leapBirthday = new Date('2000-02-29T00:00:00.000Z');
    expect(
      calculateAge(leapBirthday, new Date('2026-02-28T00:00:00.000Z')),
    ).toBe(25);
    expect(
      calculateAge(leapBirthday, new Date('2026-03-01T00:00:00.000Z')),
    ).toBe(26);
    expect(
      calculateAge(
        new Date('2000-07-29T00:00:00.000Z'),
        new Date('2026-07-29T00:00:00.000Z'),
      ),
    ).toBe(26);
  });

  it('returns private email and full date only from the owner settings read', async () => {
    const { service } = dependencies();
    await expect(service.settings('session')).resolves.toEqual({
      nickname: current.nickname,
      littleBlueBookId: current.littleBlueBookId,
      email: current.email,
      gender: 'PRIVATE',
      birthDate: '2000-02-29',
      showAge: false,
      bio: null,
      avatar: { type: 'image', value: `/media/${oldObjectKey}` },
      profileVersion,
    });
  });

  it('saves all fields with one version condition and schedules old cleanup', async () => {
    const { service, prisma, transaction, media } = dependencies();
    const result = await service.updateSettings(
      'session',
      input({
        avatarAction: 'replace',
        bio: '纯文本简介\r\n第二行',
        cropLeft: '20',
        cropTop: '10',
        cropSize: '512',
      }),
      {
        buffer: Buffer.from('source'),
        size: 6,
        originalname: 'private.png',
        mimetype: 'image/png',
      },
    );

    expect(transaction.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId, profileVersion },
        data: expect.objectContaining({
          nickname: '新资料蓝友',
          gender: 'MALE',
          birthDate: new Date('2000-02-29T00:00:00.000Z'),
          showAge: true,
          bio: '纯文本简介\n第二行',
          avatarObjectKey: newObjectKey,
          profileVersion: expect.any(String),
        }),
      }),
    );
    expect(transaction.avatarCleanup.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { objectKey: oldObjectKey } }),
    );
    expect(prisma.avatarCleanup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        objectKey: newObjectKey,
        status: 'RESERVED',
        leaseToken: expect.any(String),
        nextAttemptAt: expect.any(Date),
      }),
    });
    expect(transaction.avatarCleanup.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        objectKey: newObjectKey,
        status: 'RESERVED',
        leaseToken: expect.any(String),
        nextAttemptAt: { gt: expect.any(Date) },
      }),
    });
    expect(
      prisma.avatarCleanup.create.mock.invocationCallOrder[0],
    ).toBeLessThan(media.saveAt.mock.invocationCallOrder[0]!);
    expect(
      transaction.avatarCleanup.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(transaction.user.updateMany.mock.invocationCallOrder[0]!);
    expect(result.settings).not.toHaveProperty('avatarObjectKey');
    expect(result.publicProfile).not.toHaveProperty('email');
    expect(result.publicProfile).not.toHaveProperty('birthDate');
  });

  it('does not let a due-cleanup attempt claim an active avatar reservation', async () => {
    const { service, prisma, transaction, media, storedKeys } = dependencies();
    let continueSave!: () => void;
    let markSaveStarted!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    const saveGate = new Promise<void>((resolve) => {
      continueSave = resolve;
    });
    media.saveAt.mockImplementationOnce(async () => {
      markSaveStarted();
      await saveGate;
      storedKeys.add(newObjectKey);
      return {
        objectKey: newObjectKey,
        byteSize: 9,
        width: 512,
        height: 512,
        mimeType: 'image/webp' as const,
      };
    });

    const pendingSave = service.updateSettings(
      'session',
      input({
        avatarAction: 'replace',
        cropLeft: '0',
        cropTop: '0',
        cropSize: '512',
      }),
      {
        buffer: Buffer.from('source'),
        size: 6,
        originalname: 'source.png',
        mimetype: 'image/png',
      },
    );
    await saveStarted;

    prisma.avatarCleanup.updateMany.mockResolvedValueOnce({ count: 0 });
    await (
      service as unknown as {
        tryCleanupRecord(objectKey: string): Promise<void>;
      }
    ).tryCleanupRecord(newObjectKey);
    expect(media.deleteStrict).not.toHaveBeenCalledWith(newObjectKey);

    continueSave();
    const result = await pendingSave;
    expect(result.settings.avatar).toEqual({
      type: 'image',
      value: `/media/${newObjectKey}`,
    });
    await expect(media.read(newObjectKey)).resolves.toEqual(
      Buffer.from('stored'),
    );
    expect(transaction.avatarCleanup.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        objectKey: newObjectKey,
        status: 'RESERVED',
        leaseToken: expect.any(String),
      }),
    });
    expect(prisma.avatarCleanup.deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ objectKey: newObjectKey }),
      }),
    );
  });

  it.each([
    ['another user avatar', 1, 0],
    ['a note image', 0, 1],
  ])(
    'rechecks and preserves a claimed key referenced by %s',
    async (_source, avatarReferences, noteImageReferences) => {
      const { service, prisma, media, storedKeys } = dependencies();
      storedKeys.add(newObjectKey);
      prisma.avatarCleanup.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.user.count.mockResolvedValueOnce(avatarReferences);
      prisma.noteImage.count.mockResolvedValueOnce(noteImageReferences);

      await (
        service as unknown as {
          tryCleanupRecord(objectKey: string): Promise<void>;
        }
      ).tryCleanupRecord(newObjectKey);

      expect(media.deleteStrict).not.toHaveBeenCalledWith(newObjectKey);
      await expect(media.read(newObjectKey)).resolves.toEqual(
        Buffer.from('stored'),
      );
      expect(prisma.avatarCleanup.deleteMany).toHaveBeenCalledWith({
        where: {
          objectKey: newObjectKey,
          status: 'CLEANING',
          leaseToken: expect.any(String),
        },
      });
    },
  );

  it('refuses to formalize an avatar whose reservation was already claimed', async () => {
    const { service, prisma, transaction, media, storedKeys } = dependencies();
    transaction.avatarCleanup.deleteMany.mockResolvedValueOnce({ count: 0 });
    prisma.avatarCleanup.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateSettings(
        'session',
        input({
          avatarAction: 'replace',
          cropLeft: '0',
          cropTop: '0',
          cropSize: '512',
        }),
        {
          buffer: Buffer.from('source'),
          size: 6,
          originalname: 'source.png',
          mimetype: 'image/png',
        },
      ),
    ).rejects.toMatchObject({
      status: 500,
      response: expect.objectContaining({ code: 'PROFILE_SAVE_FAILED' }),
    });

    expect(transaction.user.updateMany).not.toHaveBeenCalled();
    expect(media.deleteStrict).not.toHaveBeenCalledWith(newObjectKey);
    expect(storedKeys.has(newObjectKey)).toBe(true);
  });

  it('turns a failed file write reservation into tracked cleanup work', async () => {
    const { service, prisma, media, storedKeys } = dependencies();
    media.saveAt.mockImplementationOnce(async () => {
      storedKeys.add(newObjectKey);
      throw new Error('disk write interrupted');
    });

    await expect(
      service.updateSettings(
        'session',
        input({
          avatarAction: 'replace',
          cropLeft: '0',
          cropTop: '0',
          cropSize: '512',
        }),
        {
          buffer: Buffer.from('source'),
          size: 6,
          originalname: 'source.png',
          mimetype: 'image/png',
        },
      ),
    ).rejects.toMatchObject({
      status: 500,
      response: expect.objectContaining({ code: 'PROFILE_SAVE_FAILED' }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.avatarCleanup.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        objectKey: newObjectKey,
        status: 'RESERVED',
        leaseToken: expect.any(String),
      }),
      data: expect.objectContaining({
        status: 'READY',
        leaseToken: null,
        lastErrorCode: 'AVATAR_WRITE_FAILED',
      }),
    });
    expect(media.deleteStrict).toHaveBeenCalledWith(newObjectKey);
    expect(storedKeys.has(newObjectKey)).toBe(false);
  });

  it('returns 409 and removes a newly stored avatar without updating fields', async () => {
    const { service, media, prisma } = dependencies(0);
    await expect(
      service.updateSettings(
        'session',
        input({
          avatarAction: 'replace',
          cropLeft: '0',
          cropTop: '0',
          cropSize: '512',
        }),
        {
          buffer: Buffer.from('source'),
          size: 6,
          originalname: 'source.png',
          mimetype: 'image/png',
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PROFILE_VERSION_CONFLICT' }),
    });
    expect(media.deleteStrict).toHaveBeenCalledWith(newObjectKey);
    expect(prisma.avatarCleanup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        objectKey: newObjectKey,
        status: 'RESERVED',
      }),
    });
    expect(prisma.avatarCleanup.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        objectKey: newObjectKey,
        status: 'CLEANING',
        leaseToken: expect.any(String),
      }),
    });
  });

  it('keeps the prewritten cleanup intent when deletion and retry metadata updates both fail', async () => {
    const { service, media, prisma } = dependencies(0, true, true);

    await expect(
      service.updateSettings(
        'session',
        input({
          avatarAction: 'replace',
          cropLeft: '0',
          cropTop: '0',
          cropSize: '512',
        }),
        {
          buffer: Buffer.from('source'),
          size: 6,
          originalname: 'source.png',
          mimetype: 'image/png',
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PROFILE_VERSION_CONFLICT' }),
    });

    expect(prisma.avatarCleanup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        objectKey: newObjectKey,
        status: 'RESERVED',
      }),
    });
    expect(media.deleteStrict).toHaveBeenCalledWith(newObjectKey);
    expect(prisma.avatarCleanup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          objectKey: newObjectKey,
          status: 'CLEANING',
        }),
        data: expect.objectContaining({
          attempts: { increment: 1 },
          lastErrorCode: 'AVATAR_DELETE_FAILED',
        }),
      }),
    );
    expect(prisma.avatarCleanup.deleteMany).not.toHaveBeenCalledWith({
      where: { objectKey: newObjectKey },
    });
  });

  it('keeps a retry record when deleting the old avatar fails', async () => {
    const { service, prisma } = dependencies(1, true);
    await service.updateSettings(
      'session',
      input({
        avatarAction: 'replace',
        cropLeft: '0',
        cropTop: '0',
        cropSize: '512',
      }),
      {
        buffer: Buffer.from('source'),
        size: 6,
        originalname: 'source.png',
        mimetype: 'image/png',
      },
    );
    expect(prisma.avatarCleanup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          objectKey: oldObjectKey,
          status: 'CLEANING',
        }),
        data: expect.objectContaining({
          attempts: { increment: 1 },
          lastErrorCode: 'AVATAR_DELETE_FAILED',
        }),
      }),
    );
  });

  it.each([
    [input({ nickname: '<script>' }), 'PROFILE_VALIDATION_FAILED'],
    [input({ birthDate: '1900-01-01' }), 'PROFILE_VALIDATION_FAILED'],
    [input({ birthDate: '2020-01-01' }), 'PROFILE_VALIDATION_FAILED'],
    [input({ birthDate: '', showAge: 'true' }), 'PROFILE_VALIDATION_FAILED'],
    [input({ bio: '字'.repeat(101) }), 'PROFILE_VALIDATION_FAILED'],
    [input({ avatarAction: 'delete', cropLeft: '0' }), 'AVATAR_INVALID'],
  ])('rejects invalid fields before any transaction', async (invalid, code) => {
    const { service, prisma } = dependencies();
    await expect(
      service.updateSettings('session', invalid, undefined),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the fourteenth birthday and rejects the day before it', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    try {
      const eligible = dependencies();
      await expect(
        eligible.service.updateSettings(
          'session',
          input({ birthDate: '2012-08-03' }),
          undefined,
        ),
      ).resolves.toBeDefined();

      const underage = dependencies();
      await expect(
        underage.service.updateSettings(
          'session',
          input({ birthDate: '2012-08-04' }),
          undefined,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PROFILE_VALIDATION_FAILED',
          details: { field: 'birthDate' },
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
