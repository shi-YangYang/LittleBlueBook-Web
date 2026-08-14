import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import { ListFollowingDto } from './dto/list-following.dto.js';
import { FollowingPageResponseDto } from './dto/profile-response.dto.js';
import { ProfileService } from './profile.service.js';
import type { RelationshipPage } from './profile.types.js';

@ApiTags('public users')
@Controller('users')
export class PublicUserRelationsController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
  ) {}

  @Get(':userId/following')
  @ApiOperation({ summary: 'List one public user following relationships' })
  @ApiOkResponse({ type: FollowingPageResponseDto })
  @ApiNotFoundResponse({
    description: 'The profile is not publicly accessible',
  })
  async following(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Query() query: ListFollowingDto,
  ): Promise<{ data: RelationshipPage }> {
    return {
      data: await this.profiles.relationships(
        readCookie(request, SESSION_COOKIE_NAME),
        userId,
        'following',
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get(':userId/followers')
  @ApiOperation({ summary: 'List one public user follower relationships' })
  @ApiOkResponse({ type: FollowingPageResponseDto })
  @ApiNotFoundResponse({
    description: 'The profile is not publicly accessible',
  })
  async followers(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Query() query: ListFollowingDto,
  ): Promise<{ data: RelationshipPage }> {
    return {
      data: await this.profiles.relationships(
        readCookie(request, SESSION_COOKIE_NAME),
        userId,
        'followers',
        query.cursor,
        query.limit,
      ),
    };
  }
}
