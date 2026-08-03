import type { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { MediaStorage } from '../media/media.types.js';
import { AuthService } from './auth.service.js';
import type { LittleBlueBookIdService } from './little-blue-book-id.service.js';
import type { RegistrationCredentialService } from './registration-credential.service.js';
import type { SessionService } from './session.service.js';
import type { VerificationCodeService } from './verification-code.service.js';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from './legal.constants.js';

describe('AuthService profile initialization', () => {
  it('records the bound authoritative versions when an existing user logs in', async () => {
    const existingUser = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'existing@example.com',
      nickname: '蓝友',
      avatarObjectKey: null,
    };
    const legalAcceptance = {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(existingUser),
        update: jest.fn().mockResolvedValue(existingUser),
      },
      legalAcceptance,
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (database: typeof prisma) => unknown) =>
        callback(prisma),
    );
    const verificationCodes = {
      verifyCode: jest.fn().mockResolvedValue({
        challengeId: 'login-challenge',
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      }),
    };
    const sessions = { create: jest.fn().mockResolvedValue('new-session') };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      verificationCodes as unknown as VerificationCodeService,
      {} as RegistrationCredentialService,
      sessions as unknown as SessionService,
      {} as LittleBlueBookIdService,
      { publicUrl: jest.fn() } as unknown as MediaStorage,
    );

    await expect(service.verify(existingUser.email, '123456')).resolves.toEqual(
      expect.objectContaining({
        status: 'authenticated',
        sessionId: 'new-session',
      }),
    );
    expect(legalAcceptance.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: existingUser.id,
        scene: 'LOGIN',
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      }),
      skipDuplicates: true,
    });
  });

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
      legalAcceptance: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (database: typeof prisma) => unknown) =>
        callback(prisma),
    );
    const registrationCredentials = {
      consume: jest.fn(async () => ({
        email: 'new@example.com',
        createdAt: new Date().toISOString(),
        challengeId: 'challenge-registration',
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
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
    expect(prisma.legalAcceptance.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scene: 'REGISTRATION',
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      }),
      skipDuplicates: true,
    });
  });
});

describe('AuthService legal acceptance state', () => {
  function createService(options?: {
    accepted?: boolean;
    restricted?: boolean;
  }) {
    let accepted = options?.accepted ?? false;
    const legalAcceptance = {
      createMany: jest.fn(
        async (input: {
          data: { scene: string; evidenceKey: string };
          skipDuplicates: boolean;
        }) => {
          if (!input.skipDuplicates) {
            throw new Error('Legal acceptance must remain idempotent.');
          }

          accepted = true;
          return { count: 1 };
        },
      ),
    };
    const prisma = {
      user: {
        findUnique: jest.fn(
          async (input: { select?: { legalAcceptances?: unknown } }) =>
            input.select?.legalAcceptances
              ? {
                  id: 'user-id',
                  ageRestrictedAt: options?.restricted ? new Date() : null,
                  legalAcceptances: accepted ? [{ id: 'acceptance-id' }] : [],
                }
              : {
                  id: 'user-id',
                  ageRestrictedAt: options?.restricted ? new Date() : null,
                },
        ),
      },
      legalAcceptance,
    };
    const sessions = {
      read: jest.fn().mockResolvedValue({
        userId: 'user-id',
        createdAt: new Date().toISOString(),
      }),
      delete: jest.fn(),
    };
    return {
      service: new AuthService(
        prisma as unknown as PrismaService,
        {} as VerificationCodeService,
        {} as RegistrationCredentialService,
        sessions as unknown as SessionService,
        {} as LittleBlueBookIdService,
        { publicUrl: jest.fn() } as unknown as MediaStorage,
      ),
      legalAcceptance,
    };
  }

  it('blocks protected writes until the current versions are accepted', async () => {
    const { service } = createService();
    await expect(
      service.assertWriteAllowed('session-id'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LEGAL_ACCEPTANCE_REQUIRED' }),
    });
  });

  it('accepts current versions idempotently across independent sessions', async () => {
    const { service, legalAcceptance } = createService();
    await expect(
      service.acceptCurrentLegalTerms('session-id'),
    ).resolves.toMatchObject({
      authenticated: true,
      requiresAcceptance: false,
    });
    await service.acceptCurrentLegalTerms('second-session-id');
    expect(legalAcceptance.createMany).toHaveBeenCalledTimes(2);
    expect(legalAcceptance.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: expect.objectContaining({
        userId: 'user-id',
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        scene: 'RECONFIRMATION',
      }),
      skipDuplicates: true,
    });
    expect(legalAcceptance.createMany.mock.calls[0]?.[0].data).toMatchObject({
      evidenceKey: expect.stringMatching(/^session:/),
    });
    expect(legalAcceptance.createMany.mock.calls[1]?.[0].data).toMatchObject({
      evidenceKey: expect.stringMatching(/^session:/),
    });
    expect(
      legalAcceptance.createMany.mock.calls[1]?.[0].data.evidenceKey,
    ).not.toBe(legalAcceptance.createMany.mock.calls[0]?.[0].data.evidenceKey);
  });

  it('blocks age-restricted accounts independently of acceptance state', async () => {
    const { service } = createService({ accepted: true, restricted: true });
    await expect(
      service.assertWriteAllowed('session-id'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCOUNT_AGE_RESTRICTED' }),
    });
  });
});
