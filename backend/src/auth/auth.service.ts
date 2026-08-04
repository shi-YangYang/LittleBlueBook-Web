import { createHash } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media.types.js';
import { publicAvatar } from '../profile/profile-avatar.js';
import { isValidNickname, normalizeEmail } from './email.js';
import { LittleBlueBookIdService } from './little-blue-book-id.service.js';
import { RegistrationCredentialService } from './registration-credential.service.js';
import { SessionService } from './session.service.js';
import type {
  AuthenticatedResult,
  LegalChallenge,
  LegalStatus,
  PublicUser,
  VerificationResult,
} from './auth.types.js';
import { VerificationCodeService } from './verification-code.service.js';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_DOCUMENTS,
} from './legal.constants.js';

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
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
  ) {}

  async requestCode(email: string, sourceIp: string): Promise<void> {
    await this.verificationCodes.requestCode(
      normalizeEmail(email),
      sourceIp || 'unknown',
    );
  }

  async verify(email: string, code: string): Promise<VerificationResult> {
    const normalizedEmail = normalizeEmail(email);
    const challenge = await this.verificationCodes.verifyCode(
      normalizedEmail,
      code,
    );

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!existingUser) {
      return {
        status: 'registration_required',
        registrationId: await this.registrationCredentials.create(
          normalizedEmail,
          challenge,
        ),
      };
    }

    const user = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: existingUser.id },
        data: { lastLoginAt: new Date() },
      });
      await this.recordAcceptance(
        transaction,
        existingUser.id,
        challenge,
        'LOGIN',
        `challenge:${challenge.challengeId}`,
      );
      return updated;
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
    this.assertChallengeCurrent(registration);

    const now = new Date();
    const user = await this.createOrRefreshUser(
      registration.email,
      nickname,
      now,
      registration,
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

  async legalStatus(sessionId: string | undefined): Promise<LegalStatus> {
    const session = sessionId ? await this.sessions.read(sessionId) : null;
    if (!session) {
      return {
        ...LEGAL_DOCUMENTS,
        authenticated: false,
        requiresAcceptance: false,
        accountRestricted: false,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        ageRestrictedAt: true,
        legalAcceptances: {
          where: {
            termsVersion: CURRENT_TERMS_VERSION,
            privacyVersion: CURRENT_PRIVACY_VERSION,
          },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!user) {
      await this.sessions.delete(sessionId!);
      return {
        ...LEGAL_DOCUMENTS,
        authenticated: false,
        requiresAcceptance: false,
        accountRestricted: false,
      };
    }

    return {
      ...LEGAL_DOCUMENTS,
      authenticated: true,
      requiresAcceptance: user.legalAcceptances.length === 0,
      accountRestricted: user.ageRestrictedAt !== null,
    };
  }

  async acceptCurrentLegalTerms(
    sessionId: string | undefined,
  ): Promise<LegalStatus> {
    if (!sessionId) throw this.authenticationRequired();
    const session = await this.sessions.read(sessionId);
    if (!session) throw this.authenticationRequired();
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, ageRestrictedAt: true },
    });
    if (!user) throw this.authenticationRequired();
    if (user.ageRestrictedAt) throw this.ageRestricted();

    const challenge: LegalChallenge = {
      challengeId: 'session',
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    };
    const sessionHash = createHash('sha256').update(sessionId).digest('hex');
    await this.recordAcceptance(
      this.prisma,
      user.id,
      challenge,
      'RECONFIRMATION',
      `session:${sessionHash}:${CURRENT_TERMS_VERSION}:${CURRENT_PRIVACY_VERSION}`,
    );
    return this.legalStatus(sessionId);
  }

  async assertWriteAllowed(sessionId: string): Promise<void> {
    const status = await this.legalStatus(sessionId);
    if (!status.authenticated) return;
    if (status.accountRestricted) throw this.ageRestricted();
    if (status.requiresAcceptance) {
      throw new ApiException(
        HttpStatus.PRECONDITION_REQUIRED,
        'LEGAL_ACCEPTANCE_REQUIRED',
        '请先确认最新的用户协议与隐私政策',
        {
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
          termsUrl: LEGAL_DOCUMENTS.termsUrl,
          privacyUrl: LEGAL_DOCUMENTS.privacyUrl,
        },
      );
    }
  }

  async requireWriteUser(sessionId: string | undefined): Promise<PublicUser> {
    if (!sessionId) throw this.authenticationRequired();
    const user = await this.currentUser(sessionId);
    if (!user) throw this.authenticationRequired();
    await this.assertWriteAllowed(sessionId);
    return user;
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
    challenge: LegalChallenge,
  ) {
    for (
      let attempt = 0;
      attempt < AuthService.ID_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const user = await transaction.user.upsert({
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
          await this.recordAcceptance(
            transaction,
            user.id,
            challenge,
            'REGISTRATION',
            `challenge:${challenge.challengeId}`,
          );
          return user;
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

  private assertChallengeCurrent(challenge: LegalChallenge): void {
    if (
      challenge.termsVersion !== CURRENT_TERMS_VERSION ||
      challenge.privacyVersion !== CURRENT_PRIVACY_VERSION
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'LEGAL_VERSION_CHANGED',
        '条款已更新，请重新确认并获取验证码',
      );
    }
  }

  private async recordAcceptance(
    database: PrismaService | Prisma.TransactionClient,
    userId: string,
    challenge: LegalChallenge,
    scene: 'REGISTRATION' | 'LOGIN' | 'RECONFIRMATION',
    evidenceKey: string,
  ): Promise<void> {
    this.assertChallengeCurrent(challenge);
    await database.legalAcceptance.createMany({
      data: {
        userId,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        scene,
        evidenceKey,
      },
      skipDuplicates: true,
    });
  }

  private authenticationRequired(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'AUTHENTICATION_REQUIRED',
      '请先登录',
    );
  }

  private ageRestricted(): ApiException {
    return new ApiException(
      HttpStatus.FORBIDDEN,
      'ACCOUNT_AGE_RESTRICTED',
      '当前账号因年龄信息受限，请通过帮助页联系处理',
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
    avatarObjectKey?: string | null;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatar: publicAvatar(
        user.nickname,
        user.avatarObjectKey ?? null,
        this.media,
      ),
    };
  }
}
