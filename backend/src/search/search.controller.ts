import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import type { NotePage } from '../notes/notes.types.js';
import {
  PublicUserNotesQueryDto,
  SearchQueryDto,
} from './dto/search-query.dto.js';
import {
  PublicUserProfileResponseDto,
  SearchNotePageResponseDto,
  SearchUserPageResponseDto,
} from './dto/search-response.dto.js';
import { SearchService } from './search.service.js';
import { SearchRateLimitService } from './search-rate-limit.service.js';
import type { PublicUserProfile, SearchUserPage } from './search.types.js';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(SearchRateLimitService)
    private readonly rateLimit: SearchRateLimitService,
  ) {}

  @Get('notes')
  @ApiOperation({ summary: 'Search public image notes' })
  @ApiOkResponse({
    description: 'Ranked cursor-paginated note results',
    type: SearchNotePageResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Keyword or cursor validation failed' })
  @ApiTooManyRequestsResponse({ description: 'Search rate limit reached' })
  async notes(
    @Req() request: Request,
    @Query() query: SearchQueryDto,
  ): Promise<{ data: NotePage }> {
    await this.rateLimit.reserve(request.ip);
    return {
      data: await this.search.notes(
        readCookie(request, SESSION_COOKIE_NAME),
        query.keyword,
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('videos')
  @ApiOperation({ summary: 'Search public video notes' })
  @ApiOkResponse({
    description: 'Ranked cursor-paginated video results',
    type: SearchNotePageResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Keyword validation failed' })
  @ApiTooManyRequestsResponse({ description: 'Search rate limit reached' })
  async videos(
    @Req() request: Request,
    @Query() query: SearchQueryDto,
  ): Promise<{ data: NotePage }> {
    await this.rateLimit.reserve(request.ip);
    return {
      data: await this.search.videos(
        readCookie(request, SESSION_COOKIE_NAME),
        query.keyword,
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('users')
  @ApiOperation({ summary: 'Search users by nickname or LittleBlueBook ID' })
  @ApiOkResponse({
    description: 'Ranked public user cards',
    type: SearchUserPageResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Keyword or cursor validation failed' })
  @ApiTooManyRequestsResponse({ description: 'Search rate limit reached' })
  async users(
    @Req() request: Request,
    @Query() query: SearchQueryDto,
  ): Promise<{ data: SearchUserPage }> {
    await this.rateLimit.reserve(request.ip);
    return {
      data: await this.search.users(
        readCookie(request, SESSION_COOKIE_NAME),
        query.keyword,
        query.cursor,
        query.limit,
      ),
    };
  }
}

@ApiTags('public users')
@Controller('users')
export class PublicUsersController {
  constructor(@Inject(SearchService) private readonly search: SearchService) {}

  @Get(':userId/profile')
  @ApiOperation({ summary: 'Read one public user profile' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({
    description: 'Public profile fields and viewer follow state',
    type: PublicUserProfileResponseDto,
  })
  @ApiNotFoundResponse({ description: 'The user does not exist' })
  async profile(
    @Req() request: Request,
    @Param('userId') userId: string,
  ): Promise<{ data: PublicUserProfile }> {
    return {
      data: await this.search.publicProfile(
        readCookie(request, SESSION_COOKIE_NAME),
        userId,
      ),
    };
  }

  @Get(':userId/notes')
  @ApiOperation({ summary: 'List one user public notes newest first' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({
    description: 'A public cursor-paginated note page',
    type: SearchNotePageResponseDto,
  })
  @ApiNotFoundResponse({ description: 'The user does not exist' })
  async notes(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Query() query: PublicUserNotesQueryDto,
  ): Promise<{ data: NotePage }> {
    return {
      data: await this.search.publicNotes(
        readCookie(request, SESSION_COOKIE_NAME),
        userId,
        query.cursor,
        query.limit,
      ),
    };
  }
}
