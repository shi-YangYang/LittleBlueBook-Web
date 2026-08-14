import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma, type Gender } from '../generated/prisma/client.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media.types.js';
import type { NoteCard, NotePage } from '../notes/notes.types.js';
import { calculateAge } from '../profile/profile-age.js';
import { publicAvatar } from '../profile/profile-avatar.js';
import { SafetyService } from '../safety/safety.service.js';
import type { ProfileGender } from '../profile/profile.types.js';
import type { PublicUserProfile, SearchUserPage } from './search.types.js';

type SearchCursor = {
  rank: number;
  createdAt: string;
  id: string;
  scope: string;
};

type NoteSearchRow = {
  id: string;
  contentType: 'IMAGE' | 'VIDEO';
  title: string;
  createdAt: Date;
  rank: number;
  authorId: string;
  nickname: string;
  avatarObjectKey: string | null;
  objectKey: string;
  width: number;
  height: number;
  likes: bigint | number;
  liked: boolean;
  viewCount: number;
  videoDurationMs: number | null;
};

type UserSearchRow = {
  id: string;
  nickname: string;
  avatarObjectKey: string | null;
  littleBlueBookId: string;
  createdAt: Date;
  rank: number;
  followers: bigint | number;
  notes: bigint | number;
  following: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENDER_LABELS: Record<Gender, ProfileGender> = {
  MALE: '男',
  FEMALE: '女',
  PRIVATE: '保密',
};

export function normalizeSearchKeyword(value: string): {
  normalized: string;
  terms: string[];
} {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  const length = Array.from(normalized).length;
  if (length < 1 || length > 50) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      'SEARCH_KEYWORD_INVALID',
      '搜索内容需为1～50个字符',
    );
  }

  const seen = new Set<string>();
  const terms = normalized.split(' ').filter((term) => {
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { normalized, terms };
}

function escapeLike(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

@Injectable()
export class SearchService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @Optional() @Inject(SafetyService) private readonly safety?: SafetyService,
  ) {}

  async notes(
    sessionId: string | undefined,
    keywordInput: string,
    cursorInput: string | undefined,
    limitInput: number,
  ): Promise<NotePage> {
    return this.searchNotes(
      'IMAGE',
      sessionId,
      keywordInput,
      cursorInput,
      limitInput,
    );
  }

  async videos(
    sessionId: string | undefined,
    keywordInput: string,
    cursorInput: string | undefined,
    limitInput: number,
  ): Promise<NotePage> {
    return this.searchNotes(
      'VIDEO',
      sessionId,
      keywordInput,
      cursorInput,
      limitInput,
    );
  }

  private async searchNotes(
    contentType: 'IMAGE' | 'VIDEO',
    sessionId: string | undefined,
    keywordInput: string,
    cursorInput: string | undefined,
    limitInput: number,
  ): Promise<NotePage> {
    const { normalized, terms } = normalizeSearchKeyword(keywordInput);
    const pageSize = this.pageSize(limitInput);
    const viewer = await this.auth.currentUser(sessionId);
    const scope = this.scope(
      contentType === 'IMAGE' ? 'notes' : 'videos',
      normalized,
    );
    const cursor = this.decodeCursor(cursorInput, scope);
    const overallConditions = terms.map((term) => {
      const pattern = escapeLike(term);
      return Prisma.sql`(
        n."title" ILIKE ${pattern} ESCAPE E'\\\\'
        OR n."content" ILIKE ${pattern} ESCAPE E'\\\\'
        OR u."nickname" ILIKE ${pattern} ESCAPE E'\\\\'
        OR c."name" ILIKE ${pattern} ESCAPE E'\\\\'
      )`;
    });
    const titleConditions = terms.map((term) => {
      const pattern = escapeLike(term);
      return Prisma.sql`n."title" ILIKE ${pattern} ESCAPE E'\\\\'`;
    });
    const anyTitleConditions = terms.map((term) => {
      const pattern = escapeLike(term);
      return Prisma.sql`n."title" ILIKE ${pattern} ESCAPE E'\\\\'`;
    });
    const cursorCondition = cursor
      ? Prisma.sql`WHERE (
          ranked."rank" > ${cursor.rank}
          OR (
            ranked."rank" = ${cursor.rank}
            AND ranked."createdAt" < ${new Date(cursor.createdAt)}
          )
          OR (
            ranked."rank" = ${cursor.rank}
            AND ranked."createdAt" = ${new Date(cursor.createdAt)}
            AND ranked."id" < ${cursor.id}::uuid
          )
        )`
      : Prisma.empty;
    const viewerId = viewer?.id ?? null;

    const rows = await this.prisma.$queryRaw<NoteSearchRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          n."id",
          n."contentType",
          n."title",
          n."createdAt",
          n."viewCount",
          u."id" AS "authorId",
          u."nickname",
          u."avatarObjectKey",
          cover."objectKey",
          cover."width",
          cover."height",
          cover."durationMs" AS "videoDurationMs",
          CASE
            WHEN lower(n."title") = lower(${normalized}) THEN 1
            WHEN ${Prisma.join(titleConditions, ' AND ')} THEN 2
            WHEN ${Prisma.join(anyTitleConditions, ' OR ')} THEN 3
            ELSE 4
          END AS "rank",
          (SELECT count(*) FROM "note_likes" nl WHERE nl."noteId" = n."id") AS "likes",
          (
            ${viewerId}::uuid IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM "note_likes" nl
              WHERE nl."noteId" = n."id" AND nl."userId" = ${viewerId}::uuid
            )
          ) AS "liked"
        FROM "notes" n
        JOIN "users" u ON u."id" = n."authorId"
        JOIN "channels" c ON c."id" = n."channelId"
        JOIN LATERAL (
          (SELECT ni."objectKey", ni."width", ni."height", NULL::integer AS "durationMs"
           FROM "note_images" ni
           WHERE ni."noteId" = n."id" AND n."contentType" = 'IMAGE'
           ORDER BY ni."order" ASC
           LIMIT 1)
          UNION ALL
          SELECT nv."coverObjectKey", nv."coverWidth", nv."coverHeight", nv."durationMs"
          FROM "note_videos" nv
          WHERE nv."noteId" = n."id" AND n."contentType" = 'VIDEO'
        ) cover ON TRUE
        WHERE u."ageRestrictedAt" IS NULL
          AND u."status" = 'ACTIVE'
          AND n."moderationStatus" = 'VISIBLE'
          AND (
            ${viewerId}::uuid IS NULL OR NOT EXISTS (
              SELECT 1 FROM "user_blocks" ub
              WHERE (ub."blockerId" = ${viewerId}::uuid AND ub."blockedId" = u."id")
                 OR (ub."blockedId" = ${viewerId}::uuid AND ub."blockerId" = u."id")
            )
          )
          AND n."contentType" = CAST(${contentType} AS "NoteContentType")
          AND ${Prisma.join(overallConditions, ' AND ')}
      )
      SELECT * FROM ranked
      ${cursorCondition}
      ORDER BY ranked."rank" ASC, ranked."createdAt" DESC, ranked."id" DESC
      LIMIT ${pageSize + 1}
    `);

    const hasMore = rows.length > pageSize;
    const pageItems = hasMore ? rows.slice(0, pageSize) : rows;
    const last = pageItems.at(-1);
    return {
      items: pageItems.map((row) => this.noteCard(row, viewer?.id)),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              rank: Number(last.rank),
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              scope,
            })
          : null,
    };
  }

  async users(
    sessionId: string | undefined,
    keywordInput: string,
    cursorInput: string | undefined,
    limitInput: number,
  ): Promise<SearchUserPage> {
    const { normalized, terms } = normalizeSearchKeyword(keywordInput);
    const pageSize = this.pageSize(limitInput);
    const viewer = await this.auth.currentUser(sessionId);
    const viewerId = viewer?.id ?? null;
    const scope = this.scope('users', normalized);
    const cursor = this.decodeCursor(cursorInput, scope);
    const overallConditions = terms.map((term) => {
      const pattern = escapeLike(term);
      return Prisma.sql`(
        u."nickname" ILIKE ${pattern} ESCAPE E'\\\\'
        OR u."littleBlueBookId" ILIKE ${pattern} ESCAPE E'\\\\'
      )`;
    });
    const nicknameConditions = terms.map((term) => {
      const pattern = escapeLike(term);
      return Prisma.sql`u."nickname" ILIKE ${pattern} ESCAPE E'\\\\'`;
    });
    const cursorCondition = cursor
      ? Prisma.sql`WHERE (
          ranked."rank" > ${cursor.rank}
          OR (
            ranked."rank" = ${cursor.rank}
            AND ranked."createdAt" < ${new Date(cursor.createdAt)}
          )
          OR (
            ranked."rank" = ${cursor.rank}
            AND ranked."createdAt" = ${new Date(cursor.createdAt)}
            AND ranked."id" < ${cursor.id}::uuid
          )
        )`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<UserSearchRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT
          u."id",
          u."nickname",
          u."littleBlueBookId",
          u."avatarObjectKey",
          u."createdAt",
          CASE
            WHEN lower(u."nickname") = lower(${normalized}) THEN 1
            WHEN ${Prisma.join(nicknameConditions, ' AND ')} THEN 2
            ELSE 3
          END AS "rank",
          (SELECT count(*) FROM "user_follows" uf WHERE uf."followedId" = u."id") AS "followers",
          (SELECT count(*) FROM "notes" n WHERE n."authorId" = u."id" AND n."moderationStatus" = 'VISIBLE') AS "notes",
          (
            ${viewerId}::uuid IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM "user_follows" uf
              WHERE uf."followerId" = ${viewerId}::uuid
                AND uf."followedId" = u."id"
            )
          ) AS "following"
        FROM "users" u
        WHERE u."ageRestrictedAt" IS NULL
          AND u."status" = 'ACTIVE'
          AND (
            ${viewerId}::uuid IS NULL OR NOT EXISTS (
              SELECT 1 FROM "user_blocks" ub
              WHERE (ub."blockerId" = ${viewerId}::uuid AND ub."blockedId" = u."id")
                 OR (ub."blockedId" = ${viewerId}::uuid AND ub."blockerId" = u."id")
            )
          )
          AND ${Prisma.join(overallConditions, ' AND ')}
      )
      SELECT * FROM ranked
      ${cursorCondition}
      ORDER BY ranked."rank" ASC, ranked."createdAt" DESC, ranked."id" DESC
      LIMIT ${pageSize + 1}
    `);

    const hasMore = rows.length > pageSize;
    const pageItems = hasMore ? rows.slice(0, pageSize) : rows;
    const last = pageItems.at(-1);
    return {
      items: pageItems.map((row) => {
        const isSelf = viewer?.id === row.id;
        return {
          id: row.id,
          nickname: row.nickname,
          littleBlueBookId: row.littleBlueBookId,
          avatar: publicAvatar(row.nickname, row.avatarObjectKey, this.media),
          followers: Number(row.followers),
          notes: Number(row.notes),
          viewer: {
            authenticated: Boolean(viewer),
            isSelf,
            following: Boolean(row.following),
            canFollow: Boolean(viewer) && !isSelf,
          },
        };
      }),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              rank: Number(last.rank),
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              scope,
            })
          : null,
    };
  }

  async publicProfile(
    sessionId: string | undefined,
    userId: string,
  ): Promise<PublicUserProfile> {
    if (!UUID_PATTERN.test(userId)) throw this.userNotFound();
    const viewer = await this.auth.currentUser(sessionId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        littleBlueBookId: true,
        gender: true,
        birthDate: true,
        showAge: true,
        ageRestrictedAt: true,
        status: true,
        bio: true,
        avatarObjectKey: true,
      },
    });
    if (!user || user.ageRestrictedAt || user.status === 'SUSPENDED')
      throw this.userNotFound();
    if (viewer) await this.safety?.assertNotBlocked(viewer.id, user.id);

    const [
      following,
      followers,
      receivedLikes,
      receivedFavorites,
      relation,
      reverseRelation,
    ] = await Promise.all([
      this.visibleRelationshipCount(user.id, 'following', viewer?.id),
      this.visibleRelationshipCount(user.id, 'followers', viewer?.id),
      this.prisma.noteLike.count({
        where: {
          note: { authorId: user.id, moderationStatus: 'VISIBLE' },
        },
      }),
      this.prisma.noteFavorite.count({
        where: {
          note: { authorId: user.id, moderationStatus: 'VISIBLE' },
        },
      }),
      viewer && viewer.id !== user.id
        ? this.prisma.userFollow.findUnique({
            where: {
              followerId_followedId: {
                followerId: viewer.id,
                followedId: user.id,
              },
            },
            select: { followerId: true },
          })
        : null,
      viewer && viewer.id !== user.id
        ? this.prisma.userFollow.findUnique({
            where: {
              followerId_followedId: {
                followerId: user.id,
                followedId: viewer.id,
              },
            },
            select: { followerId: true },
          })
        : null,
    ]);
    const isSelf = viewer?.id === user.id;
    return {
      id: user.id,
      nickname: user.nickname,
      littleBlueBookId: user.littleBlueBookId,
      gender: GENDER_LABELS[user.gender],
      age: user.birthDate && user.showAge ? calculateAge(user.birthDate) : null,
      bio: user.bio,
      avatar: publicAvatar(user.nickname, user.avatarObjectKey, this.media),
      stats: {
        following,
        followers,
        receivedLikesAndFavorites: receivedLikes + receivedFavorites,
      },
      viewer: {
        authenticated: Boolean(viewer),
        isSelf,
        following: Boolean(relation),
        followedBy: Boolean(reverseRelation),
        mutual: Boolean(relation && reverseRelation),
        canFollow: Boolean(viewer) && !isSelf,
        canMessage:
          Boolean(viewer) && !isSelf && Boolean(relation && reverseRelation),
      },
    };
  }

  async publicNotes(
    sessionId: string | undefined,
    userId: string,
    cursorInput: string | undefined,
    limitInput: number,
  ): Promise<NotePage> {
    if (!UUID_PATTERN.test(userId)) throw this.userNotFound();
    const [viewer, exists] = await Promise.all([
      this.auth.currentUser(sessionId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, ageRestrictedAt: true, status: true },
      }),
    ]);
    if (!exists || exists.ageRestrictedAt || exists.status === 'SUSPENDED')
      throw this.userNotFound();
    if (viewer) await this.safety?.assertNotBlocked(viewer.id, userId);
    const pageSize = this.pageSize(limitInput);
    const scope = `public-notes:${userId}`;
    const cursor = this.decodeNoteCursor(cursorInput, scope);
    const notes = await this.prisma.note.findMany({
      where: {
        authorId: userId,
        moderationStatus: 'VISIBLE',
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: {
        id: true,
        contentType: true,
        title: true,
        createdAt: true,
        viewCount: true,
        author: {
          select: { id: true, nickname: true, avatarObjectKey: true },
        },
        images: {
          where: { order: 0 },
          take: 1,
          select: { objectKey: true, width: true, height: true },
        },
        video: {
          select: {
            coverObjectKey: true,
            coverWidth: true,
            coverHeight: true,
            durationMs: true,
          },
        },
        likes: viewer
          ? {
              where: { userId: viewer.id },
              take: 1,
              select: { userId: true },
            }
          : false,
        _count: { select: { likes: true } },
      },
    });
    const hasMore = notes.length > pageSize;
    const pageItems = hasMore ? notes.slice(0, pageSize) : notes;
    const last = pageItems.at(-1);
    return {
      items: pageItems.map((note) =>
        this.noteCard(
          {
            ...note,
            objectKey:
              note.contentType === 'VIDEO'
                ? (note.video?.coverObjectKey ?? '')
                : (note.images[0]?.objectKey ?? ''),
            width:
              note.contentType === 'VIDEO'
                ? (note.video?.coverWidth ?? 0)
                : (note.images[0]?.width ?? 0),
            height:
              note.contentType === 'VIDEO'
                ? (note.video?.coverHeight ?? 0)
                : (note.images[0]?.height ?? 0),
            videoDurationMs: note.video?.durationMs ?? null,
            authorId: note.author.id,
            nickname: note.author.nickname,
            avatarObjectKey: note.author.avatarObjectKey,
            rank: 0,
            likes: note._count.likes,
            liked: (note.likes?.length ?? 0) > 0,
            viewCount: note.viewCount,
          },
          viewer?.id,
        ),
      ),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              rank: 0,
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              scope,
            })
          : null,
    };
  }

  private async visibleRelationshipCount(
    ownerId: string,
    kind: 'following' | 'followers',
    viewerId?: string,
  ): Promise<number> {
    const ownerBlockedIds = this.safety
      ? await this.safety.blockedIds(ownerId)
      : [];
    const viewerBlockedIds =
      viewerId && viewerId !== ownerId && this.safety
        ? await this.safety.blockedIds(viewerId)
        : [];
    const blockedIds = [...new Set([...ownerBlockedIds, ...viewerBlockedIds])];
    return this.prisma.userFollow.count({
      where: {
        ...(kind === 'following'
          ? { followerId: ownerId }
          : { followedId: ownerId }),
        ...(kind === 'following'
          ? { followed: { ageRestrictedAt: null, status: 'ACTIVE' } }
          : { follower: { ageRestrictedAt: null, status: 'ACTIVE' } }),
        ...(blockedIds.length > 0
          ? kind === 'following'
            ? { followedId: { notIn: blockedIds } }
            : { followerId: { notIn: blockedIds } }
          : {}),
      },
    });
  }

  private noteCard(row: NoteSearchRow, viewerId?: string): NoteCard {
    if (!row.objectKey) {
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'NOTE_MEDIA_INVALID',
        '笔记暂时无法显示',
      );
    }
    return {
      id: row.id,
      contentType: row.contentType,
      title: row.title,
      cover: {
        url: this.media.publicUrl(row.objectKey),
        width: row.width,
        height: row.height,
      },
      author: {
        id: row.authorId,
        nickname: row.nickname,
        avatar: publicAvatar(row.nickname, row.avatarObjectKey, this.media),
      },
      likes: Number(row.likes),
      liked: Boolean(row.liked),
      canLike: viewerId !== row.authorId,
      views: row.viewCount,
      videoDurationMs: row.videoDurationMs,
    };
  }

  private pageSize(value: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'PAGINATION_INVALID',
        '分页参数无效',
      );
    }
    return parsed;
  }

  private scope(
    kind: 'notes' | 'videos' | 'users',
    normalized: string,
  ): string {
    return `search:${kind}:${createHash('sha256').update(normalized).digest('base64url').slice(0, 20)}`;
  }

  private encodeCursor(cursor: SearchCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(
    input: string | undefined,
    expectedScope: string,
  ): SearchCursor | null {
    if (!input) return null;
    try {
      if (input.length > 512) throw new Error('too long');
      const parsed = JSON.parse(
        Buffer.from(input, 'base64url').toString('utf8'),
      ) as Partial<SearchCursor>;
      if (
        !Number.isInteger(parsed.rank) ||
        (parsed.rank ?? 0) < 1 ||
        (parsed.rank ?? 0) > 4 ||
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.createdAt)) ||
        typeof parsed.id !== 'string' ||
        !UUID_PATTERN.test(parsed.id) ||
        parsed.scope !== expectedScope
      ) {
        throw new Error('invalid');
      }
      return parsed as SearchCursor;
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'CURSOR_INVALID',
        '分页游标无效',
      );
    }
  }

  private decodeNoteCursor(
    input: string | undefined,
    expectedScope: string,
  ): SearchCursor | null {
    if (!input) return null;
    try {
      if (input.length > 512) throw new Error('too long');
      const parsed = JSON.parse(
        Buffer.from(input, 'base64url').toString('utf8'),
      ) as Partial<SearchCursor>;
      if (
        parsed.rank !== 0 ||
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.createdAt)) ||
        typeof parsed.id !== 'string' ||
        !UUID_PATTERN.test(parsed.id) ||
        parsed.scope !== expectedScope
      ) {
        throw new Error('invalid');
      }
      return parsed as SearchCursor;
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'CURSOR_INVALID',
        '分页游标无效',
      );
    }
  }

  private userNotFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'USER_NOT_FOUND',
      '用户不存在',
    );
  }
}
