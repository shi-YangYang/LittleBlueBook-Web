import type { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { MediaStorage } from '../media/media.types.js';
import { AuthService } from './auth.service.js';
import type { LittleBlueBookIdService } from './little-blue-book-id.service.js';
import type { RegistrationCredentialService } from './registration-credential.service.js';
import type { SessionService } from './session.service.js';
import type { VerificationCodeService } from './verification-code.service.js';

describe('AuthService profile initialization', () => {
  it('retries registration with a new number after an ID collision', async () => {
    const collision = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype) as object,
      {
        code: 'P2002',
        meta: { target: ['littleBlueBookId'] },
      },
    );
    const createdUser = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'new@example.com',
      nickname: '蓝友',
      littleBlueBookId: '0000000002',
      gender: 'PRIVATE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    };
    const prisma = {
      user: {
        upsert: jest
          .fn()
          .mockRejectedValueOnce(collision)
          .mockResolvedValueOnce(createdUser),
      },
    };
    const registrationCredentials = {
      consume: jest.fn(async () => ({
        email: 'new@example.com',
        createdAt: new Date().toISOString(),
      })),
    };
    const sessions = { create: jest.fn(async () => 'new-session') };
    const littleBlueBookIds = {
      generate: jest
        .fn()
        .mockReturnValueOnce('0000000001')
        .mockReturnValueOnce('0000000002'),
    };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as VerificationCodeService,
      registrationCredentials as unknown as RegistrationCredentialService,
      sessions as unknown as SessionService,
      littleBlueBookIds as unknown as LittleBlueBookIdService,
      {
        publicUrl: jest.fn((key: string) => `/media/${key}`),
      } as unknown as MediaStorage,
    );

    await expect(
      service.register('registration-token', '蓝友'),
    ).resolves.toEqual({
      status: 'authenticated',
      user: {
        id: createdUser.id,
        email: createdUser.email,
        nickname: createdUser.nickname,
        avatar: { type: 'initial', value: '蓝' },
      },
      sessionId: 'new-session',
    });
    expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.user.upsert.mock.calls[0]?.[0].create).toMatchObject({
      littleBlueBookId: '0000000001',
      gender: 'PRIVATE',
    });
    expect(prisma.user.upsert.mock.calls[1]?.[0].create).toMatchObject({
      littleBlueBookId: '0000000002',
      gender: 'PRIVATE',
    });
  });
});
