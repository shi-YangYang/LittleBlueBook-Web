import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { isValidNickname, normalizeEmail } from './email.js';
import { LittleBlueBookIdService } from './little-blue-book-id.service.js';
import { RegistrationCredentialService } from './registration-credential.service.js';
import { SessionService } from './session.service.js';
import type {
  AuthenticatedResult,
  PublicUser,
  VerificationResult,
} from './auth.types.js';
import { VerificationCodeService } from './verification-code.service.js';

@Injectable()
export class AuthService {
  private static readonly ID_GENERATION_ATTEMPTS = 10;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VerificationCodeService)
    private readonly verificationCodes: VerificationCodeService,
    @Inject(RegistrationCredentialService)
    private readonly registrationCredentials: RegistrationCredentialService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(LittleBlueBookIdService)
    private readonly littleBlueBookIds: LittleBlueBookIdService,
  ) {}

  async requestCode(email: string, sourceIp: string): Promise<void> {
    await this.verificationCodes.requestCode(
      normalizeEmail(email),
      sourceIp || 'unknown',
    );
  }

  async verify(email: string, code: string): Promise<VerificationResult> {
    const normalizedEmail = normalizeEmail(email);
    await this.verificationCodes.verifyCode(normalizedEmail, code);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!existingUser) {
      return {
        status: 'registration_required',
        registrationId:
          await this.registrationCredentials.create(normalizedEmail),
      };
    }

    const user = await this.prisma.user.update({
      where: { id: existingUser.id },
      data: { lastLoginAt: new Date() },
    });
    const sessionId = await this.sessions.create(user.id);

    return {
      status: 'authenticated',
      user: this.toPublicUser(user),
      sessionId,
    };
  }

  async register(
    registrationId: string | undefined,
    nickname: string,
  ): Promise<AuthenticatedResult> {
    if (!registrationId) {
      throw this.registrationExpired();
    }
    if (!isValidNickname(nickname)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'NICKNAME_INVALID',
        '昵称需为2～20个中文、字母、数字或下划线',
      );
    }

    const registration =
      await this.registrationCredentials.consume(registrationId);
    if (!registration) {
      throw this.registrationExpired();
    }

    const now = new Date();
    const user = await this.createOrRefreshUser(
      registration.email,
      nickname,
      now,
    );
    const sessionId = await this.sessions.create(user.id);

    return {
      status: 'authenticated',
      user: this.toPublicUser(user),
      sessionId,
    };
  }

  async currentUser(sessionId: string | undefined): Promise<PublicUser | null> {
    if (!sessionId) {
      return null;
    }

    const session = await this.sessions.read(sessionId);
    if (!session) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) {
      await this.sessions.delete(sessionId);
      return null;
    }

    return this.toPublicUser(user);
  }

  async hasPendingRegistration(
    registrationId: string | undefined,
  ): Promise<boolean> {
    if (!registrationId) {
      return false;
    }
    return (await this.registrationCredentials.read(registrationId)) !== null;
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (sessionId) {
      await this.sessions.delete(sessionId);
    }
  }

  private registrationExpired(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'REGISTRATION_EXPIRED',
      '验证状态已失效，请重新获取验证码',
    );
  }

  private async createOrRefreshUser(
    email: string,
    nickname: string,
    lastLoginAt: Date,
  ) {
    for (
      let attempt = 0;
      attempt < AuthService.ID_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.user.upsert({
          where: { email },
          create: {
            email,
            nickname,
            littleBlueBookId: this.littleBlueBookIds.generate(),
            gender: 'PRIVATE',
            lastLoginAt,
          },
          update: {
            lastLoginAt,
          },
        });
      } catch (error) {
        if (this.isLittleBlueBookIdConflict(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ApiException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'USER_ID_GENERATION_FAILED',
      '注册失败，请稍后重试',
    );
  }

  private isLittleBlueBookIdConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes('littleBlueBookId')
      : String(target).includes('littleBlueBookId');
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    nickname: string;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
    };
  }
}
