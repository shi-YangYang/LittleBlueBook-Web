import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Req,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import { ProfileService } from './profile.service.js';
import type { CurrentProfile } from './profile.types.js';

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
  ) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read the current authenticated user profile' })
  @ApiOkResponse({
    schema: {
      example: {
        data: {
          nickname: '蓝书用户',
          littleBlueBookId: '0123456789',
          gender: '保密',
          avatar: { type: 'initial', value: '蓝' },
          stats: {
            following: 0,
            followers: 0,
            receivedLikesAndFavorites: 0,
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  async current(@Req() request: Request): Promise<{ data: CurrentProfile }> {
    return {
      data: await this.profiles.current(
        readCookie(request, SESSION_COOKIE_NAME),
      ),
    };
  }
}
