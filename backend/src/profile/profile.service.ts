import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Gender } from '../generated/prisma/client.js';
import type { CurrentProfile, ProfileGender } from './profile.types.js';

const GENDER_LABELS: Record<Gender, ProfileGender> = {
  MALE: '男',
  FEMALE: '女',
  PRIVATE: '保密',
};

@Injectable()
export class ProfileService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async current(sessionId: string | undefined): Promise<CurrentProfile> {
    const sessionUser = await this.auth.currentUser(sessionId);
    if (!sessionUser) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        '请先登录',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        nickname: true,
        littleBlueBookId: true,
        gender: true,
      },
    });
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        '请先登录',
      );
    }
    const [following, followers, receivedLikes, receivedFavorites] =
      await Promise.all([
        this.prisma.userFollow.count({
          where: { followerId: user.id },
        }),
        this.prisma.userFollow.count({
          where: { followedId: user.id },
        }),
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
      avatar: {
        type: 'initial',
        value: Array.from(user.nickname.trim())[0] ?? '蓝',
      },
      stats: {
        following,
        followers,
        receivedLikesAndFavorites: receivedLikes + receivedFavorites,
      },
    };
  }
}
