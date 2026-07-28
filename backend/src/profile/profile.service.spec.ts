import { ApiException } from '../common/api-exception.js';
import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import { ProfileService } from './profile.service.js';

describe('ProfileService', () => {
  it.each([
    ['MALE', '男'],
    ['FEMALE', '女'],
    ['PRIVATE', '保密'],
  ] as const)('maps %s to its public Chinese value', async (gender, label) => {
    const auth = {
      currentUser: jest.fn(async () => ({
        id: 'internal-id',
        email: 'private@example.com',
        nickname: '蓝海',
      })),
    };
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'internal-id',
          nickname: '蓝海',
          littleBlueBookId: '0123456789',
          gender,
        })),
      },
      userFollow: { count: jest.fn(async () => 2) },
      noteLike: { count: jest.fn(async () => 3) },
      noteFavorite: { count: jest.fn(async () => 4) },
    };
    const service = new ProfileService(
      auth as unknown as AuthService,
      prisma as unknown as PrismaService,
    );

    await expect(service.current('session-secret')).resolves.toEqual({
      nickname: '蓝海',
      littleBlueBookId: '0123456789',
      gender: label,
      avatar: { type: 'initial', value: '蓝' },
      stats: {
        following: 2,
        followers: 2,
        receivedLikesAndFavorites: 7,
      },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'internal-id' },
      select: {
        id: true,
        nickname: true,
        littleBlueBookId: true,
        gender: true,
      },
    });
  });

  it('rejects a missing session before querying profile data', async () => {
    const auth = { currentUser: jest.fn(async () => null) };
    const prisma = { user: { findUnique: jest.fn() } };
    const service = new ProfileService(
      auth as unknown as AuthService,
      prisma as unknown as PrismaService,
    );

    await expect(service.current(undefined)).rejects.toBeInstanceOf(
      ApiException,
    );
    await service.current(undefined).catch((error: unknown) => {
      expect((error as ApiException).getStatus()).toBe(401);
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
