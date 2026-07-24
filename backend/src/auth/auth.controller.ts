import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type { AppEnvironment } from '../config/environment.js';
import { AuthService } from './auth.service.js';
import {
  REGISTRATION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from './auth.constants.js';
import {
  clearRegistrationCookie,
  clearSessionCookie,
  readCookie,
  setRegistrationCookie,
  setSessionCookie,
} from './cookies.js';
import { RegisterDto } from './dto/register.dto.js';
import { RequestCodeDto } from './dto/request-code.dto.js';
import { VerifyCodeDto } from './dto/verify-code.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ConfigService) config: ConfigService<AppEnvironment, true>,
  ) {
    this.secureCookies = config.getOrThrow('COOKIE_SECURE');
  }

  @Post('email-code/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a passwordless email verification code' })
  @ApiOkResponse({
    schema: { example: { data: { message: '验证码已发送' } } },
  })
  @ApiBadRequestResponse({ description: 'Invalid email or terms not accepted' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit reached' })
  async requestCode(
    @Body() input: RequestCodeDto,
    @Ip() sourceIp: string,
  ): Promise<{ data: { message: string } }> {
    await this.auth.requestCode(input.email, sourceIp);
    return { data: { message: '验证码已发送' } };
  }

  @Post('email-code/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a passwordless email code' })
  async verifyCode(
    @Body() input: VerifyCodeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    data:
      | {
          status: 'authenticated';
          user: { id: string; email: string; nickname: string };
        }
      | { status: 'registration_required' };
  }> {
    const result = await this.auth.verify(input.email, input.code);

    if (result.status === 'registration_required') {
      setRegistrationCookie(
        response,
        result.registrationId,
        this.secureCookies,
      );
      return { data: { status: 'registration_required' } };
    }

    clearRegistrationCookie(response, this.secureCookies);
    setSessionCookie(response, result.sessionId, this.secureCookies);
    return {
      data: {
        status: 'authenticated',
        user: result.user,
      },
    };
  }

  @Post('registration/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete registration for a verified email' })
  async register(
    @Body() input: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    data: {
      status: 'authenticated';
      user: { id: string; email: string; nickname: string };
    };
  }> {
    const result = await this.auth.register(
      readCookie(request, REGISTRATION_COOKIE_NAME),
      input.nickname,
    );

    clearRegistrationCookie(response, this.secureCookies);
    setSessionCookie(response, result.sessionId, this.secureCookies);
    return {
      data: {
        status: result.status,
        user: result.user,
      },
    };
  }

  @Get('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read the current login and registration state' })
  async session(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    data: {
      authenticated: boolean;
      user: { id: string; email: string; nickname: string } | null;
      pendingRegistration: boolean;
      registrationExpired: boolean;
    };
  }> {
    const sessionId = readCookie(request, SESSION_COOKIE_NAME);
    const registrationId = readCookie(request, REGISTRATION_COOKIE_NAME);
    const user = await this.auth.currentUser(sessionId);

    if (user) {
      if (registrationId) {
        clearRegistrationCookie(response, this.secureCookies);
      }
      return {
        data: {
          authenticated: true,
          user,
          pendingRegistration: false,
          registrationExpired: false,
        },
      };
    }

    if (sessionId) {
      clearSessionCookie(response, this.secureCookies);
    }
    const pendingRegistration =
      await this.auth.hasPendingRegistration(registrationId);
    const registrationExpired = Boolean(registrationId && !pendingRegistration);
    if (registrationExpired) {
      clearRegistrationCookie(response, this.secureCookies);
    }

    return {
      data: {
        authenticated: false,
        user: null,
        pendingRegistration,
        registrationExpired,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out only the current session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: { success: true } }> {
    await this.auth.logout(readCookie(request, SESSION_COOKIE_NAME));
    clearSessionCookie(response, this.secureCookies);
    return { data: { success: true } };
  }
}
