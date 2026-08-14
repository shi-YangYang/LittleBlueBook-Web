import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiConflictResponse,
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import type { UploadedMemoryFile } from '../media/media.types.js';
import {
  CurrentProfileResponseDto,
  ProfileAuthenticationRequiredErrorResponseDto,
  ProfileAvatarInvalidErrorResponseDto,
  ProfileAvatarTooLargeErrorResponseDto,
  ProfileBusinessValidationErrorResponseDto,
  FollowingPageResponseDto,
  ProfileMultipartInvalidErrorResponseDto,
  ProfileSaveFailedErrorResponseDto,
  ProfileSettingsResponseDto,
  ProfileSettingsUpdateResponseDto,
  ProfileValidationErrorResponseDto,
  ProfileVersionConflictErrorResponseDto,
} from './dto/profile-response.dto.js';
import { UpdateProfileSettingsDto } from './dto/update-profile-settings.dto.js';
import { ListFollowingDto } from './dto/list-following.dto.js';
import { ProfileService } from './profile.service.js';
import type {
  CurrentProfile,
  FollowingPage,
  PrivateProfileSettings,
  ProfileSettingsUpdateResult,
} from './profile.types.js';

@ApiTags('profile')
@ApiExtraModels(
  ProfileValidationErrorResponseDto,
  ProfileBusinessValidationErrorResponseDto,
  ProfileAvatarInvalidErrorResponseDto,
  ProfileMultipartInvalidErrorResponseDto,
)
@Controller('profile')
export class ProfileController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
  ) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read the current authenticated user profile' })
  @ApiOkResponse({
    description: 'The current public profile and statistics',
    type: CurrentProfileResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ProfileAuthenticationRequiredErrorResponseDto,
  })
  async current(@Req() request: Request): Promise<{ data: CurrentProfile }> {
    return {
      data: await this.profiles.current(
        readCookie(request, SESSION_COOKIE_NAME),
      ),
    };
  }

  @Get('me/settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read private profile settings for current user' })
  @ApiOkResponse({
    description:
      'Private settings including email, full birth date and opaque version',
    type: ProfileSettingsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ProfileAuthenticationRequiredErrorResponseDto,
  })
  async settings(
    @Req() request: Request,
  ): Promise<{ data: PrivateProfileSettings }> {
    return {
      data: await this.profiles.settings(
        readCookie(request, SESSION_COOKIE_NAME),
      ),
    };
  }

  @Get('me/following')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List only the current user following privately' })
  @ApiOkResponse({ type: FollowingPageResponseDto })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ProfileAuthenticationRequiredErrorResponseDto,
  })
  async following(
    @Req() request: Request,
    @Query() query: ListFollowingDto,
  ): Promise<{ data: FollowingPage }> {
    return {
      data: await this.profiles.following(
        readCookie(request, SESSION_COOKIE_NAME),
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('me/followers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List only the current user followers privately' })
  @ApiOkResponse({ type: FollowingPageResponseDto })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ProfileAuthenticationRequiredErrorResponseDto,
  })
  async followers(
    @Req() request: Request,
    @Query() query: ListFollowingDto,
  ): Promise<{ data: FollowingPage }> {
    return {
      data: await this.profiles.followers(
        readCookie(request, SESSION_COOKIE_NAME),
        query.cursor,
        query.limit,
      ),
    };
  }

  @Patch('me/settings')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: {
        files: 1,
        fileSize: 5 * 1024 * 1024,
        fields: 10,
        fieldSize: 16 * 1024,
      },
    }),
  )
  @ApiOperation({ summary: 'Atomically update current user profile settings' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'nickname',
        'gender',
        'birthDate',
        'showAge',
        'bio',
        'avatarAction',
        'profileVersion',
      ],
      properties: {
        nickname: { type: 'string', minLength: 2, maxLength: 20 },
        gender: { type: 'string', enum: ['MALE', 'FEMALE', 'PRIVATE'] },
        birthDate: { type: 'string', format: 'date', nullable: true },
        showAge: { type: 'string', enum: ['true', 'false'] },
        bio: { type: 'string', maxLength: 100, nullable: true },
        avatarAction: {
          type: 'string',
          enum: ['keep', 'replace', 'delete'],
        },
        profileVersion: { type: 'string', format: 'uuid' },
        cropLeft: { type: 'string', pattern: '^\\d+$' },
        cropTop: { type: 'string', pattern: '^\\d+$' },
        cropSize: { type: 'string', pattern: '^\\d+$' },
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Original JPEG, PNG or WebP; required for replace',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'The final private and public profile with a new version',
    type: ProfileSettingsUpdateResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_ERROR, PROFILE_VALIDATION_FAILED, AVATAR_INVALID or MULTIPART_INVALID',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ProfileValidationErrorResponseDto) },
        { $ref: getSchemaPath(ProfileBusinessValidationErrorResponseDto) },
        { $ref: getSchemaPath(ProfileAvatarInvalidErrorResponseDto) },
        { $ref: getSchemaPath(ProfileMultipartInvalidErrorResponseDto) },
      ],
      discriminator: {
        propertyName: 'code',
        mapping: {
          VALIDATION_ERROR: getSchemaPath(ProfileValidationErrorResponseDto),
          PROFILE_VALIDATION_FAILED: getSchemaPath(
            ProfileBusinessValidationErrorResponseDto,
          ),
          AVATAR_INVALID: getSchemaPath(ProfileAvatarInvalidErrorResponseDto),
          MULTIPART_INVALID: getSchemaPath(
            ProfileMultipartInvalidErrorResponseDto,
          ),
        },
      },
    },
  })
  @ApiPayloadTooLargeResponse({
    description: 'AVATAR_TOO_LARGE',
    type: ProfileAvatarTooLargeErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'PROFILE_VERSION_CONFLICT',
    type: ProfileVersionConflictErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'PROFILE_SAVE_FAILED',
    type: ProfileSaveFailedErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ProfileAuthenticationRequiredErrorResponseDto,
  })
  async updateSettings(
    @Req() request: Request,
    @Body() input: UpdateProfileSettingsDto,
    @UploadedFile() avatar: UploadedMemoryFile | undefined,
  ): Promise<{ data: ProfileSettingsUpdateResult }> {
    return {
      data: await this.profiles.updateSettings(
        readCookie(request, SESSION_COOKIE_NAME),
        input,
        avatar,
      ),
    };
  }
}
