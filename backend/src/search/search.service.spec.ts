import { ApiException } from '../common/api-exception.js';
import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from '../media/media.types.js';
import { normalizeSearchKeyword, SearchService } from './search.service.js';

const viewer = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'viewer@example.com',
  nickname: '搜索者',
};
const authorId = '00000000-0000-4000-8000-000000000002';

function dependencies(authenticated = true) {
  const auth = {
    currentUser: jest.fn(async () => (authenticated ? viewer : null)),
  };
  const prisma = {
    $queryRaw: jest.fn(async () => []),
    user: {
      findUnique: jest.fn(async () => null),
    },
    userFollow: {
      count: jest.fn(async () => 0),
      findUnique: jest.fn(async () => null),
    },
    noteLike: { count: jest.fn(async () => 0) },
    noteFavorite: { count: jest.fn(async () => 0) },
    note: { findMany: jest.fn(async () => []) },
  };
  const media = {
    save: jest.fn(),
    deleteMany: jest.fn(),
    deleteStrict: jest.fn(),
    read: jest.fn(),
    publicUrl: jest.fn((key: string) => `https://media.test/${key}`),
  };
  const service = new SearchService(
    auth as unknown as AuthService,
    prisma as unknown as PrismaService,
    media as unknown as MediaStorage,
  );
  return { service, auth, prisma, media };
}

describe('SearchService', () => {
  it('normalizes Unicode terms, collapses spaces and removes duplicates', () => {
    expect(normalizeSearchKeyword('  蓝书   BLUE blue  ')).toEqual({
      normalized: '蓝书 BLUE blue',
      terms: ['蓝书', 'BLUE'],
    });
    expect(() => normalizeSearchKeyword('')).toThrow(ApiException);
    expect(() => normalizeSearchKeyword('蓝'.repeat(51))).toThrow(ApiException);
  });

  it('maps ranked note rows to private-safe cards and emits a scoped cursor', async () => {
    const { service, prisma } = dependencies();
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce(
      Array.from({ length: 21 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
        title: `蓝色装备${index}`,
        createdAt: new Date(
          `2026-07-${String(28 - index).padStart(2, '0')}T10:00:00.000Z`,
        ),
        rank: index === 0 ? 1 : 2,
        authorId,
        nickname: '户外蓝友',
        avatarObjectKey: null,
        objectKey: `${String(index).padStart(48, 'a')}.png`,
        width: 120,
        height: 160,
        likes: BigInt(3),
        liked: true,
        email: 'must-not-leak@example.com',
        content: 'must-not-leak',
      })),
    );

    const result = await service.notes('session', '蓝色 装备', undefined, 20);

    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toMatchObject({
      title: '蓝色装备0',
      author: { id: authorId, nickname: '户外蓝友' },
      likes: 3,
      liked: true,
      canLike: true,
    });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  it('treats LIKE metacharacters as plain parameter values', async () => {
    const { service, prisma } = dependencies(false);

    await service.notes(undefined, String.raw`100% _蓝\书`, undefined, 20);

    const query = (prisma.$queryRaw as jest.Mock).mock.calls[0]?.[0] as {
      values?: unknown[];
    };
    expect(query.values).toEqual(
      expect.arrayContaining([String.raw`%100\%%`, String.raw`%\_蓝\\书%`]),
    );
  });

  it('isolates cursors by entity and normalized keyword', async () => {
    const { service, prisma } = dependencies(false);
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce(
      Array.from({ length: 21 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 200).padStart(12, '0')}`,
        title: `测试${index}`,
        createdAt: new Date('2026-07-28T10:00:00.000Z'),
        rank: 2,
        authorId,
        nickname: '蓝友',
        objectKey: `${String(index).padStart(48, 'b')}.png`,
        width: 120,
        height: 160,
        likes: 0,
        liked: false,
      })),
    );
    const first = await service.notes(undefined, '测试', undefined, 20);

    await expect(
      service.notes(undefined, '另一个词', first.nextCursor ?? undefined, 20),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CURSOR_INVALID' }),
    });
    await expect(
      service.users(undefined, '测试', first.nextCursor ?? undefined, 20),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CURSOR_INVALID' }),
    });
  });

  it('returns user cards without email or age and identifies the current user', async () => {
    const { service, prisma } = dependencies();
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      {
        id: viewer.id,
        nickname: '搜索者',
        avatarObjectKey: null,
        littleBlueBookId: '0000000001',
        createdAt: new Date('2026-07-28T10:00:00.000Z'),
        rank: 1,
        followers: BigInt(4),
        notes: BigInt(2),
        following: false,
        email: 'must-not-leak@example.com',
        age: 30,
      },
    ]);

    const result = await service.users('session', '搜索者', undefined, 20);

    expect(result.items[0]).toEqual({
      id: viewer.id,
      nickname: '搜索者',
      littleBlueBookId: '0000000001',
      avatar: { type: 'initial', value: '搜' },
      followers: 4,
      notes: 2,
      viewer: {
        authenticated: true,
        isSelf: true,
        following: false,
        canFollow: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('example.com');
    expect(JSON.stringify(result)).not.toContain('age');
  });

  it('returns a public profile whitelist and rejects missing users', async () => {
    const { service, prisma } = dependencies();
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: authorId,
      nickname: '公开蓝友',
      littleBlueBookId: '0000000002',
      gender: 'PRIVATE',
      birthDate: null,
      showAge: false,
      bio: null,
      avatarObjectKey: null,
      email: 'must-not-leak@example.com',
    });
    prisma.userFollow.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    prisma.noteLike.count.mockResolvedValueOnce(4);
    prisma.noteFavorite.count.mockResolvedValueOnce(5);
    (prisma.userFollow.findUnique as jest.Mock).mockResolvedValueOnce({
      followerId: viewer.id,
    });

    const result = await service.publicProfile('session', authorId);

    expect(result).toEqual({
      id: authorId,
      nickname: '公开蓝友',
      littleBlueBookId: '0000000002',
      gender: '保密',
      age: null,
      bio: null,
      avatar: { type: 'initial', value: '公' },
      stats: {
        following: 2,
        followers: 3,
        receivedLikesAndFavorites: 9,
      },
      viewer: {
        authenticated: true,
        isSelf: false,
        following: true,
        canFollow: true,
        canMessage: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('example.com');

    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      service.publicProfile(undefined, authorId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
    });
  });

  it('searches the video category independently and validates input', async () => {
    const { service } = dependencies(false);
    await expect(
      service.videos(undefined, '蓝书', undefined, 20),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(
      service.videos(undefined, ' ', undefined, 20),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SEARCH_KEYWORD_INVALID' }),
    });
  });
});
