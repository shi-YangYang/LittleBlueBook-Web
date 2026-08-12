import { Buffer } from 'node:buffer';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthService } from '../auth/auth.service.js';
import { isValidNickname } from '../auth/email.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Gender } from '../generated/prisma/client.js';
import {
  MEDIA_STORAGE,
  type MediaStorage,
  type UploadedMemoryFile,
} from '../media/media.types.js';
import { AvatarProcessorService } from './avatar-processor.service.js';
import type { UpdateProfileSettingsDto } from './dto/update-profile-settings.dto.js';
import { calculateAge } from './profile-age.js';
import { publicAvatar } from './profile-avatar.js';
import type {
  FollowingPage,
  CurrentProfile,
  PrivateProfileSettings,
  ProfileGender,
  ProfileSettingsUpdateResult,
} from './profile.types.js';
import type { AppEnvironment } from '../config/environment.js';
import { SafetyService } from '../safety/safety.service.js';

const GENDER_LABELS: Record<Gender, ProfileGender> = {
  MALE: '男',
  FEMALE: '女',
  PRIVATE: '保密',
};

const AVATAR_RESERVATION_TTL_MS = 5 * 60_000;
const AVATAR_CLEANUP_LEASE_MS = 60_000;
const AVATAR_CLEANUP_RETRY_MS = 60_000;

type UserProfileRecord = {
  nickname: string;
  littleBlueBookId: string;
  email: string;
  gender: Gender;
  birthDate: Date | null;
  showAge: boolean;
  bio: string | null;
  avatarObjectKey: string | null;
  profileVersion: string;
};

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AvatarProcessorService)
    private readonly avatarProcessor: AvatarProcessorService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @Inject(ConfigService)
    private readonly config: ConfigService<AppEnvironment, true>,
    @Optional() @Inject(SafetyService) private readonly safety?: SafetyService,
  ) {}

  async current(sessionId: string | undefined): Promise<CurrentProfile> {
    const userId = await this.requireUserId(sessionId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
    if (!user) throw this.authenticationRequired();
    const [following, followers, receivedLikes, receivedFavorites] =
      await Promise.all([
        this.prisma.userFollow.count({ where: { followerId: user.id } }),
        this.prisma.userFollow.count({ where: { followedId: user.id } }),
        this.prisma.noteLike.count({
          where: { note: { authorId: user.id } },
        }),
        this.prisma.noteFavorite.count({
          where: { note: { authorId: user.id } },
        }),
      ]);

    return {
      nickname: user.nickname,
      littleBlueBookId: user.littleBlueBookId,
      gender: GENDER_LABELS[user.gender],
      age: this.publicAge(user.birthDate ?? null, Boolean(user.showAge)),
      bio: user.bio ?? null,
      avatar: publicAvatar(
        user.nickname,
        user.avatarObjectKey ?? null,
        this.media,
      ),
      stats: {
        following,
        followers,
        receivedLikesAndFavorites: receivedLikes + receivedFavorites,
      },
    };
  }

  async settings(
    sessionId: string | undefined,
  ): Promise<PrivateProfileSettings> {
    const userId = await this.requireUserId(sessionId);
    void this.retryDueCleanup(userId).catch(() => undefined);
    const user = await this.findSettingsUser(userId);
    if (!user) throw this.authenticationRequired();
    return this.privateSettings(user);
  }

  async following(
    sessionId: string | undefined,
    cursorInput: string | undefined,
  ): Promise<FollowingPage> {
    const userId = await this.requireUserId(sessionId);
    const blockedIds = this.safety ? await this.safety.blockedIds(userId) : [];
    const cursor = this.decodeFollowingCursor(cursorInput, userId);
    const rows = await this.prisma.userFollow.findMany({
      where: {
        followerId: userId,
        followed: this.safety
          ? { ageRestrictedAt: null, status: 'ACTIVE' }
          : { ageRestrictedAt: null },
        ...(this.safety ? { followedId: { notIn: blockedIds } } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  followedId: { lt: cursor.followedId },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { followedId: 'desc' }],
      take: 21,
      select: {
        followedId: true,
        createdAt: true,
        followed: {
          select: {
            nickname: true,
            littleBlueBookId: true,
            bio: true,
            avatarObjectKey: true,
          },
        },
      },
    });
    const hasMore = rows.length > 20;
    const pageRows = hasMore ? rows.slice(0, 20) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => ({
        id: row.followedId,
        nickname: row.followed.nickname,
        littleBlueBookId: row.followed.littleBlueBookId,
        bio: row.followed.bio,
        avatar: publicAvatar(
          row.followed.nickname,
          row.followed.avatarObjectKey,
          this.media,
        ),
      })),
      nextCursor:
        hasMore && last
          ? this.encodeFollowingCursor({
              createdAt: last.createdAt.toISOString(),
              followedId: last.followedId,
              userId,
            })
          : null,
    };
  }

  async updateSettings(
    sessionId: string | undefined,
    input: UpdateProfileSettingsDto,
    avatarFile: UploadedMemoryFile | undefined,
  ): Promise<ProfileSettingsUpdateResult> {
    const userId = await this.requireUserId(sessionId);
    const normalized = this.validateInput(input, avatarFile);
    const current = await this.findSettingsUser(userId);
    if (!current) throw this.authenticationRequired();

    let newObjectKey: string | null = null;
    let newReservationToken: string | null = null;
    if (normalized.avatarAction === 'replace') {
      const processed = await this.avatarProcessor.process(avatarFile!, {
        left: normalized.cropLeft!,
        top: normalized.cropTop!,
        size: normalized.cropSize!,
      });
      const reservedObjectKey = this.media.createObjectKey(processed.extension);
      const reservationToken = randomUUID();
      try {
        await this.prisma.avatarCleanup.create({
          data: {
            userId,
            objectKey: reservedObjectKey,
            status: 'RESERVED',
            leaseToken: reservationToken,
            nextAttemptAt: new Date(Date.now() + AVATAR_RESERVATION_TTL_MS),
          },
        });
      } catch (error) {
        if (error instanceof ApiException) throw error;
        throw this.saveFailed();
      }
      try {
        const stored = await this.media.saveAt(reservedObjectKey, processed);
        newObjectKey = stored.objectKey;
        newReservationToken = reservationToken;
      } catch (error) {
        await this.releaseReservation(
          reservedObjectKey,
          reservationToken,
          'AVATAR_WRITE_FAILED',
        );
        await this.tryCleanupRecord(reservedObjectKey);
        if (error instanceof ApiException) throw error;
        throw this.saveFailed();
      }
    }

    const nextAvatarObjectKey =
      normalized.avatarAction === 'keep'
        ? current.avatarObjectKey
        : normalized.avatarAction === 'delete'
          ? null
          : newObjectKey;
    const oldAvatarObjectKey =
      current.avatarObjectKey && current.avatarObjectKey !== nextAvatarObjectKey
        ? current.avatarObjectKey
        : null;
    const nextProfileVersion = randomUUID();

    let updated: UserProfileRecord;
    try {
      updated = await this.prisma.$transaction(async (transaction) => {
        if (newObjectKey && newReservationToken) {
          const reservation = await transaction.avatarCleanup.deleteMany({
            where: {
              objectKey: newObjectKey,
              status: 'RESERVED',
              leaseToken: newReservationToken,
              nextAttemptAt: { gt: new Date() },
            },
          });
          if (reservation.count !== 1) {
            throw this.saveFailed();
          }
        }
        const result = await transaction.user.updateMany({
          where: {
            id: userId,
            profileVersion: input.profileVersion,
          },
          data: {
            nickname: normalized.nickname,
            gender: normalized.gender,
            birthDate: normalized.birthDate,
            showAge: normalized.showAge,
            bio: normalized.bio,
            avatarObjectKey: nextAvatarObjectKey,
            profileVersion: nextProfileVersion,
          },
        });
        if (result.count !== 1) {
          throw this.versionConflict();
        }
        if (oldAvatarObjectKey) {
          await transaction.avatarCleanup.upsert({
            where: { objectKey: oldAvatarObjectKey },
            create: {
              userId,
              objectKey: oldAvatarObjectKey,
              status: 'READY',
              leaseToken: null,
              nextAttemptAt: new Date(),
            },
            update: {
              userId,
              status: 'READY',
              leaseToken: null,
              nextAttemptAt: new Date(),
              lastErrorCode: null,
            },
          });
        }
        const saved = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            nickname: true,
            littleBlueBookId: true,
            email: true,
            gender: true,
            birthDate: true,
            showAge: true,
            bio: true,
            avatarObjectKey: true,
            profileVersion: true,
          },
        });
        if (!saved) throw this.saveFailed();
        return saved;
      });
    } catch (error) {
      if (newObjectKey && newReservationToken) {
        await this.releaseReservation(
          newObjectKey,
          newReservationToken,
          'AVATAR_SAVE_ABORTED',
        );
        await this.tryCleanupRecord(newObjectKey);
      }
      if (error instanceof ApiException) throw error;
      throw this.saveFailed();
    }

    if (oldAvatarObjectKey) {
      await this.tryCleanupRecord(oldAvatarObjectKey);
    }

    return {
      settings: this.privateSettings(updated),
      publicProfile: {
        nickname: updated.nickname,
        littleBlueBookId: updated.littleBlueBookId,
        gender: GENDER_LABELS[updated.gender],
        age: this.publicAge(updated.birthDate, updated.showAge),
        bio: updated.bio,
        avatar: publicAvatar(
          updated.nickname,
          updated.avatarObjectKey,
          this.media,
        ),
      },
    };
  }

  private validateInput(
    input: UpdateProfileSettingsDto,
    avatarFile: UploadedMemoryFile | undefined,
  ) {
    const nickname = input.nickname.trim();
    if (!isValidNickname(nickname)) {
      throw this.validationFailed(
        'nickname',
        '昵称需为2～20个中文、字母、数字或下划线',
      );
    }
    const bio = input.bio.replace(/\r\n?/g, '\n').trim() || null;
    if (bio && Array.from(bio).length > 100) {
      throw this.validationFailed('bio', '个人简介不能超过100个字符');
    }
    const birthDate = this.parseBirthDate(input.birthDate);
    let showAge = input.showAge === 'true';
    if (showAge && !birthDate) {
      throw this.validationFailed('showAge', '设置出生日期后才能公开年龄');
    }
    if (!birthDate) showAge = false;
    const cropValues = [input.cropLeft, input.cropTop, input.cropSize].map(
      (value) => (value === undefined ? undefined : Number(value)),
    );
    if (input.avatarAction === 'replace') {
      if (
        !avatarFile ||
        cropValues.some(
          (value) => value === undefined || !Number.isInteger(value),
        )
      ) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'AVATAR_INVALID',
          '请选择并裁剪头像',
        );
      }
    } else if (avatarFile || cropValues.some((value) => value !== undefined)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'AVATAR_INVALID',
        '当前头像操作不应包含图片或裁剪参数',
      );
    }

    return {
      nickname,
      gender: input.gender,
      birthDate,
      showAge,
      bio,
      avatarAction: input.avatarAction,
      cropLeft: cropValues[0],
      cropTop: cropValues[1],
      cropSize: cropValues[2],
    };
  }

  private parseBirthDate(value: string): Date | null {
    const normalized = value.trim();
    if (!normalized) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw this.validationFailed('birthDate', '出生日期无效');
    }
    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== normalized
    ) {
      throw this.validationFailed('birthDate', '出生日期无效');
    }
    const today = new Date();
    const todayDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const age = calculateAge(date, todayDate);
    if (date > todayDate || age < 14 || age > 120) {
      throw this.validationFailed('birthDate', '小蓝书仅支持年满14周岁的用户');
    }
    return date;
  }

  private async findSettingsUser(
    userId: string,
  ): Promise<UserProfileRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        nickname: true,
        littleBlueBookId: true,
        email: true,
        gender: true,
        birthDate: true,
        showAge: true,
        bio: true,
        avatarObjectKey: true,
        profileVersion: true,
      },
    });
  }

  private privateSettings(user: UserProfileRecord): PrivateProfileSettings {
    return {
      nickname: user.nickname,
      littleBlueBookId: user.littleBlueBookId,
      email: user.email,
      gender: user.gender,
      birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
      showAge: user.showAge,
      bio: user.bio,
      avatar: publicAvatar(user.nickname, user.avatarObjectKey, this.media),
      profileVersion: user.profileVersion,
    };
  }

  private publicAge(birthDate: Date | null, showAge: boolean): number | null {
    return birthDate && showAge ? calculateAge(birthDate) : null;
  }

  private async releaseReservation(
    objectKey: string,
    reservationToken: string,
    errorCode: string,
  ): Promise<void> {
    try {
      await this.prisma.avatarCleanup.updateMany({
        where: {
          objectKey,
          status: 'RESERVED',
          leaseToken: reservationToken,
        },
        data: {
          status: 'READY',
          leaseToken: null,
          lastErrorCode: errorCode,
          nextAttemptAt: new Date(),
        },
      });
    } catch {
      // The prewritten RESERVED record remains durable and becomes claimable
      // after its reservation expiry even if this transition cannot be saved.
      this.logger.error('AVATAR_RESERVATION_RELEASE_FAILED');
    }
  }

  private async tryCleanupRecord(objectKey: string): Promise<void> {
    const leaseToken = randomUUID();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + AVATAR_CLEANUP_LEASE_MS);
    let claimed = false;
    try {
      const claim = await this.prisma.avatarCleanup.updateMany({
        where: {
          objectKey,
          nextAttemptAt: { lte: now },
          status: { in: ['RESERVED', 'READY', 'CLEANING'] },
        },
        data: {
          status: 'CLEANING',
          leaseToken,
          nextAttemptAt: leaseExpiresAt,
        },
      });
      claimed = claim.count === 1;
    } catch {
      this.logger.error('AVATAR_CLEANUP_CLAIM_FAILED');
      return;
    }
    if (!claimed) return;

    let referenced = true;
    try {
      const [avatarReferences, noteImageReferences] = await Promise.all([
        this.prisma.user.count({ where: { avatarObjectKey: objectKey } }),
        this.prisma.noteImage.count({ where: { objectKey } }),
      ]);
      referenced = avatarReferences > 0 || noteImageReferences > 0;
    } catch {
      await this.rescheduleClaim(
        objectKey,
        leaseToken,
        'AVATAR_REFERENCE_CHECK_FAILED',
      );
      return;
    }

    if (referenced) {
      await this.prisma.avatarCleanup
        .deleteMany({
          where: { objectKey, status: 'CLEANING', leaseToken },
        })
        .catch(() =>
          this.logger.error('AVATAR_CLEANUP_PROTECTED_RECORD_FAILED'),
        );
      return;
    }

    try {
      // Every profile assignment consumes an unexpired RESERVED row in the
      // same transaction. Once this row is CLEANING, no profile transaction
      // can begin referencing the key between this check and deletion.
      await this.media.deleteStrict(objectKey);
    } catch {
      await this.rescheduleClaim(objectKey, leaseToken, 'AVATAR_DELETE_FAILED');
      return;
    }

    await this.prisma.avatarCleanup
      .deleteMany({
        where: { objectKey, status: 'CLEANING', leaseToken },
      })
      .catch(() => this.logger.error('AVATAR_CLEANUP_DELETE_RECORD_FAILED'));
  }

  private async rescheduleClaim(
    objectKey: string,
    leaseToken: string,
    errorCode: string,
  ): Promise<void> {
    try {
      await this.prisma.avatarCleanup.updateMany({
        where: { objectKey, status: 'CLEANING', leaseToken },
        data: {
          status: 'READY',
          leaseToken: null,
          attempts: { increment: 1 },
          lastErrorCode: errorCode,
          nextAttemptAt: new Date(Date.now() + AVATAR_CLEANUP_RETRY_MS),
        },
      });
    } catch {
      // The CLEANING row already carries the finite lease expiry. If updating
      // retry metadata fails, that durable row becomes claimable again.
      this.logger.error('AVATAR_CLEANUP_UPDATE_FAILED');
    }
  }

  private async retryDueCleanup(userId: string): Promise<void> {
    const records = await this.prisma.avatarCleanup
      .findMany({
        where: {
          userId,
          nextAttemptAt: { lte: new Date() },
          status: { in: ['RESERVED', 'READY', 'CLEANING'] },
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 5,
        select: { objectKey: true },
      })
      .catch(() => []);
    for (const record of records) {
      await this.tryCleanupRecord(record.objectKey);
    }
  }

  private async requireUserId(sessionId: string | undefined): Promise<string> {
    const sessionUser = await this.auth.currentUser(sessionId);
    if (!sessionUser) throw this.authenticationRequired();
    return sessionUser.id;
  }

  private encodeFollowingCursor(value: {
    createdAt: string;
    followedId: string;
    userId: string;
  }): string {
    const payload = Buffer.from(JSON.stringify(value), 'utf8').toString(
      'base64url',
    );
    const signature = createHmac(
      'sha256',
      this.config.getOrThrow('AUTH_CODE_HASH_SECRET'),
    )
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  private decodeFollowingCursor(
    cursor: string | undefined,
    userId: string,
  ): { createdAt: string; followedId: string; userId: string } | null {
    if (!cursor) return null;
    try {
      if (cursor.length > 768) throw new Error('too long');
      const [payload, signature, extra] = cursor.split('.');
      if (!payload || !signature || extra) throw new Error('invalid shape');
      const expected = createHmac(
        'sha256',
        this.config.getOrThrow('AUTH_CODE_HASH_SECRET'),
      )
        .update(payload)
        .digest();
      const supplied = Buffer.from(signature, 'base64url');
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        throw new Error('invalid signature');
      }
      const parsed = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as Partial<{ createdAt: string; followedId: string; userId: string }>;
      if (
        parsed.userId !== userId ||
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.createdAt)) ||
        typeof parsed.followedId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          parsed.followedId,
        )
      ) {
        throw new Error('invalid payload');
      }
      return parsed as {
        createdAt: string;
        followedId: string;
        userId: string;
      };
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'FOLLOWING_CURSOR_INVALID',
        '关注列表分页游标无效',
      );
    }
  }

  private authenticationRequired(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'AUTHENTICATION_REQUIRED',
      '请先登录',
    );
  }

  private validationFailed(field: string, message: string): ApiException {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'PROFILE_VALIDATION_FAILED',
      message,
      { field },
    );
  }

  private versionConflict(): ApiException {
    return new ApiException(
      HttpStatus.CONFLICT,
      'PROFILE_VERSION_CONFLICT',
      '资料已在其他窗口更新，请重新加载后再编辑',
    );
  }

  private saveFailed(): ApiException {
    return new ApiException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'PROFILE_SAVE_FAILED',
      '资料保存失败，请稍后重试',
    );
  }
}
