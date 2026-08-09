import { ApiException } from '../common/api-exception.js';
import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from '../media/media.types.js';
import type { AvatarProcessorService } from './avatar-processor.service.js';
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
          birthDate: null,
          showAge: false,
          bio: null,
          avatarObjectKey: null,
        })),
      },
      userFollow: { count: jest.fn(async () => 2) },
      noteLike: { count: jest.fn(async () => 3) },
      noteFavorite: { count: jest.fn(async () => 4) },
    };
    const service = new ProfileService(
      auth as unknown as AuthService,
      prisma as unknown as PrismaService,
      {} as AvatarProcessorService,
      {
        publicUrl: jest.fn((key: string) => `/media/${key}`),
      } as unknown as MediaStorage,
      {
        getOrThrow: jest.fn(() => 'unit-test-secret-at-least-32-characters'),
      } as never,
    );

    await expect(service.current('session-secret')).resolves.toEqual({
      nickname: '蓝海',
      littleBlueBookId: '0123456789',
      gender: label,
      age: null,
      bio: null,
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
        birthDate: true,
        showAge: true,
        bio: true,
        avatarObjectKey: true,
      },
    });
  });

  it('rejects a missing session before querying profile data', async () => {
    const auth = { currentUser: jest.fn(async () => null) };
    const prisma = { user: { findUnique: jest.fn() } };
    const service = new ProfileService(
      auth as unknown as AuthService,
      prisma as unknown as PrismaService,
      {} as AvatarProcessorService,
      {} as MediaStorage,
      {
        getOrThrow: jest.fn(() => 'unit-test-secret-at-least-32-characters'),
      } as never,
    );

    await expect(service.current(undefined)).rejects.toBeInstanceOf(
      ApiException,
    );
    await service.current(undefined).catch((error: unknown) => {
      expect((error as ApiException).getStatus()).toBe(401);
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns a private stable following page and rejects a tampered cursor', async () => {
    const auth = {
      currentUser: jest.fn(async () => ({
        id: '00000000-0000-4000-8000-000000000001',
        email: 'private@example.com',
        nickname: '蓝海',
      })),
    };
    const rows = Array.from({ length: 21 }, (_, index) => ({
      followedId: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
      createdAt: new Date(
        `2026-08-04T10:${String(59 - index).padStart(2, '0')}:00.000Z`,
      ),
      followed: {
        nickname: `蓝友${index}`,
        littleBlueBookId: String(10_000_000 + index),
        bio: index === 0 ? '公开简介' : null,
        avatarObjectKey: null,
      },
    }));
    const prisma = {
      userFollow: { findMany: jest.fn(async () => rows) },
    };
    const service = new ProfileService(
      auth as unknown as AuthService,
      prisma as unknown as PrismaService,
      {} as AvatarProcessorService,
      { publicUrl: jest.fn() } as unknown as MediaStorage,
      {
        getOrThrow: jest.fn(() => 'unit-test-secret-at-least-32-characters'),
      } as never,
    );

    const page = await service.following('session-secret', undefined);
    expect(page.items).toHaveLength(20);
    expect(page.items[0]).toEqual({
      id: rows[0]!.followedId,
      nickname: '蓝友0',
      littleBlueBookId: '10000000',
      bio: '公开简介',
      avatar: { type: 'initial', value: '蓝' },
    });
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(prisma.userFollow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          followerId: '00000000-0000-4000-8000-000000000001',
          followed: { ageRestrictedAt: null },
        },
        orderBy: [{ createdAt: 'desc' }, { followedId: 'desc' }],
        take: 21,
      }),
    );

    await expect(
      service.following('session-secret', `${page.nextCursor}tampered`),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FOLLOWING_CURSOR_INVALID' }),
    });
    expect(prisma.userFollow.findMany).toHaveBeenCalledTimes(1);
  });
});
