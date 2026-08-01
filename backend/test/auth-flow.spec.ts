import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { MAIL_SENDER } from '../src/auth/auth.constants.js';
import type { VerificationMailSender } from '../src/auth/mail/verification-mail.sender.js';
import { configureApplication } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';

type TestUser = {
  id: string;
  email: string;
  nickname: string;
  littleBlueBookId: string;
  gender: 'MALE' | 'FEMALE' | 'PRIVATE';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
};

class TestRedis {
  readonly values = new Map<string, string>();
  readonly counters = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async getDel(key: string): Promise<string | null> {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async eval(
    _script: string,
    keys: string[],
    args: string[],
  ): Promise<number | number[]> {
    if (args.length === 8) {
      const limits = args.slice(0, 4).map(Number);
      if (
        keys.some(
          (key, index) => (this.counters.get(key) ?? 0) >= (limits[index] ?? 0),
        )
      ) {
        return 0;
      }
      keys.forEach((key) =>
        this.counters.set(key, (this.counters.get(key) ?? 0) + 1),
      );
      return 1;
    }

    if (args.length === 0) {
      keys.forEach((key) => this.counters.delete(key));
      return 1;
    }

    const key = keys[0]!;
    const raw = this.values.get(key);
    if (!raw) {
      return [-1, 0];
    }
    const record = JSON.parse(raw) as { hash: string; attempts: number };
    if (record.hash === args[0]) {
      this.values.delete(key);
      return [1, 0];
    }
    record.attempts += 1;
    if (record.attempts >= Number(args[1])) {
      this.values.delete(key);
      return [0, 0];
    }
    this.values.set(key, JSON.stringify(record));
    return [0, Number(args[1]) - record.attempts];
  }
}

class TestPrisma {
  readonly users = new Map<string, TestUser>();
  private sequence = 0;

  readonly user = {
    findUnique: jest.fn(
      async (input: {
        where: { email?: string; id?: string };
      }): Promise<TestUser | null> => {
        if (input.where.email) {
          return this.users.get(input.where.email) ?? null;
        }
        return (
          [...this.users.values()].find((user) => user.id === input.where.id) ??
          null
        );
      },
    ),
    update: jest.fn(
      async (input: {
        where: { id: string };
        data: { lastLoginAt: Date };
      }): Promise<TestUser> => {
        const user = [...this.users.values()].find(
          (candidate) => candidate.id === input.where.id,
        );
        if (!user) {
          throw new Error('missing user');
        }
        user.lastLoginAt = input.data.lastLoginAt;
        user.updatedAt = input.data.lastLoginAt;
        return user;
      },
    ),
    upsert: jest.fn(
      async (input: {
        where: { email: string };
        create: {
          email: string;
          nickname: string;
          littleBlueBookId: string;
          gender: 'MALE' | 'FEMALE' | 'PRIVATE';
          lastLoginAt: Date;
        };
        update: { lastLoginAt: Date };
      }): Promise<TestUser> => {
        const existing = this.users.get(input.where.email);
        if (existing) {
          existing.lastLoginAt = input.update.lastLoginAt;
          existing.updatedAt = input.update.lastLoginAt;
          return existing;
        }
        const user: TestUser = {
          id: `00000000-0000-4000-8000-${String(++this.sequence).padStart(12, '0')}`,
          email: input.create.email,
          nickname: input.create.nickname,
          littleBlueBookId: input.create.littleBlueBookId,
          gender: input.create.gender,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: input.create.lastLoginAt,
        };
        this.users.set(user.email, user);
        return user;
      },
    ),
  };

  readonly userFollow = {
    count: jest.fn(async () => 0),
  };

  readonly noteLike = {
    count: jest.fn(async () => 0),
  };

  readonly noteFavorite = {
    count: jest.fn(async () => 0),
  };
}

function cookieValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const setCookie = headers['set-cookie'];
  const values = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const cookie = values.find((value) => value.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Missing ${name} cookie`);
  }
  return cookie.split(';')[0]!;
}

function cookieHeaders(
  headers: Record<string, string | string[] | undefined>,
): string {
  const setCookie = headers['set-cookie'];
  return Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
}

describe('passwordless authentication API', () => {
  let app: INestApplication;
  let prisma: TestPrisma;
  const sentCodes = new Map<string, string>();

  beforeAll(async () => {
    prisma = new TestPrisma();
    const redis = new TestRedis();
    const mailer: VerificationMailSender = {
      sendVerificationCode: jest.fn(
        async (email: string, code: string): Promise<void> => {
          sentCodes.set(email, code);
        },
      ),
    };
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(MAIL_SENDER)
      .useValue(mailer)
      .compile();

    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the exact terms validation message', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/email-code/request')
      .send({ email: 'user@example.com', acceptedTerms: false })
      .expect(400)
      .expect({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: '请先阅读并同意用户协议与隐私政策',
        details: { fields: ['acceptedTerms'] },
      });
  });

  it('does not expose superseded authentication paths', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/code/request')
      .send({ email: 'user@example.com', acceptedTerms: true })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ nickname: '蓝书用户' })
      .expect(404);
  });

  it('completes new-user verification, registration, session recovery and logout', async () => {
    const email = 'new.user@example.com';
    await request(app.getHttpServer())
      .post('/api/v1/auth/email-code/request')
      .send({ email: `  ${email.toUpperCase()} `, acceptedTerms: true })
      .expect(200)
      .expect({ data: { message: '验证码已发送' } });

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/email-code/verify')
      .send({ email, code: sentCodes.get(email) })
      .expect(200)
      .expect({ data: { status: 'registration_required' } });
    const registrationCookie = cookieValue(
      verifyResponse.headers,
      'lbb_registration',
    );
    expect(cookieHeaders(verifyResponse.headers)).toContain('HttpOnly');
    expect(cookieHeaders(verifyResponse.headers)).toContain('SameSite=Lax');

    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', registrationCookie)
      .expect(200)
      .expect({
        data: {
          authenticated: false,
          user: null,
          pendingRegistration: true,
          registrationExpired: false,
        },
      });

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/registration/complete')
      .set('Cookie', registrationCookie)
      .send({ nickname: '蓝书用户' })
      .expect(200);
    expect(registerResponse.body.data).toMatchObject({
      status: 'authenticated',
      user: { email, nickname: '蓝书用户' },
    });
    const sessionCookie = cookieValue(registerResponse.headers, 'lbb_session');
    const createdUser = prisma.users.get(email);
    expect(createdUser?.littleBlueBookId).toMatch(/^\d{10}$/);
    expect(createdUser?.gender).toBe('PRIVATE');

    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', sessionCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          authenticated: true,
          pendingRegistration: false,
          registrationExpired: false,
          user: { email, nickname: '蓝书用户' },
        });
      });

    await request(app.getHttpServer())
      .get('/api/v1/profile/me')
      .set('Cookie', sessionCookie)
      .expect(200)
      .expect({
        data: {
          nickname: '蓝书用户',
          littleBlueBookId: createdUser?.littleBlueBookId,
          gender: '保密',
          age: null,
          bio: null,
          avatar: { type: 'initial', value: '蓝' },
          stats: {
            following: 0,
            followers: 0,
            receivedLikesAndFavorites: 0,
          },
        },
      });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', sessionCookie)
      .expect(200)
      .expect({ data: { success: true } });

    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', sessionCookie)
      .expect(200)
      .expect({
        data: {
          authenticated: false,
          user: null,
          pendingRegistration: false,
          registrationExpired: false,
        },
      });
  });

  it('logs in an existing account without disclosing status during sending', async () => {
    const existing: TestUser = {
      id: '00000000-0000-4000-8000-999999999999',
      email: 'existing@example.com',
      nickname: '已注册用户',
      littleBlueBookId: '0000000001',
      gender: 'PRIVATE',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    };
    prisma.users.set(existing.email, existing);

    await request(app.getHttpServer())
      .post('/api/v1/auth/email-code/request')
      .send({ email: existing.email, acceptedTerms: true })
      .expect(200)
      .expect({ data: { message: '验证码已发送' } });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/email-code/verify')
      .send({ email: existing.email, code: sentCodes.get(existing.email) })
      .expect(200);

    expect(response.body.data).toEqual({
      status: 'authenticated',
      user: {
        id: existing.id,
        email: existing.email,
        nickname: existing.nickname,
        avatar: { type: 'initial', value: '已' },
      },
    });
    expect(cookieHeaders(response.headers)).toContain('lbb_session=');
  });

  it('rejects unauthenticated profile requests without leaking fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/profile/me')
      .expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      code: 'AUTHENTICATION_REQUIRED',
      message: '请先登录',
    });
    expect(JSON.stringify(response.body)).not.toContain('email');
    expect(JSON.stringify(response.body)).not.toContain('nickname');
  });
});
