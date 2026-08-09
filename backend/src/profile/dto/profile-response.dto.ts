import { ApiProperty } from '@nestjs/swagger';

import { ProfileAvatarDto } from './profile-avatar.dto.js';

class ProfileStatisticsDto {
  @ApiProperty({ type: Number, minimum: 0 })
  following!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  followers!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  receivedLikesAndFavorites!: number;
}

class PublicProfileDto {
  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: String, pattern: '^\\d{10}$' })
  littleBlueBookId!: string;

  @ApiProperty({ type: String, enum: ['男', '女', '保密'] })
  gender!: '男' | '女' | '保密';

  @ApiProperty({ type: Number, nullable: true })
  age!: number | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 100 })
  bio!: string | null;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;
}

class CurrentProfileDto {
  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: String, pattern: '^\\d{10}$' })
  littleBlueBookId!: string;

  @ApiProperty({ type: String, enum: ['男', '女', '保密'] })
  gender!: '男' | '女' | '保密';

  @ApiProperty({ type: Number, nullable: true })
  age!: number | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 100 })
  bio!: string | null;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;

  @ApiProperty({ type: () => ProfileStatisticsDto })
  stats!: ProfileStatisticsDto;
}

class PrivateProfileSettingsDto {
  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: String, pattern: '^\\d{10}$' })
  littleBlueBookId!: string;

  @ApiProperty({ type: String, format: 'email' })
  email!: string;

  @ApiProperty({ type: String, enum: ['MALE', 'FEMALE', 'PRIVATE'] })
  gender!: 'MALE' | 'FEMALE' | 'PRIVATE';

  @ApiProperty({ type: String, format: 'date', nullable: true })
  birthDate!: string | null;

  @ApiProperty({ type: Boolean })
  showAge!: boolean;

  @ApiProperty({ type: String, nullable: true, maxLength: 100 })
  bio!: string | null;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;

  @ApiProperty({ type: String, format: 'uuid' })
  profileVersion!: string;
}

export class CurrentProfileResponseDto {
  @ApiProperty({ type: () => CurrentProfileDto })
  data!: CurrentProfileDto;
}

export class ProfileSettingsResponseDto {
  @ApiProperty({ type: () => PrivateProfileSettingsDto })
  data!: PrivateProfileSettingsDto;
}

class ProfileSettingsUpdateDto {
  @ApiProperty({ type: () => PrivateProfileSettingsDto })
  settings!: PrivateProfileSettingsDto;

  @ApiProperty({ type: () => PublicProfileDto })
  publicProfile!: PublicProfileDto;
}

export class ProfileSettingsUpdateResponseDto {
  @ApiProperty({ type: () => ProfileSettingsUpdateDto })
  data!: ProfileSettingsUpdateDto;
}

class FollowingUserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: String, pattern: '^\\d{10}$' })
  littleBlueBookId!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 100 })
  bio!: string | null;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;
}

class FollowingPageDto {
  @ApiProperty({ type: () => FollowingUserDto, isArray: true })
  items!: FollowingUserDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class FollowingPageResponseDto {
  @ApiProperty({ type: () => FollowingPageDto })
  data!: FollowingPageDto;
}

export class ProfileValidationErrorDetailsDto {
  @ApiProperty({
    type: [String],
    uniqueItems: true,
    description: 'Stable request field paths; never rejected values',
    example: ['gender'],
  })
  fields!: string[];
}

export class ProfileValidationErrorResponseDto {
  @ApiProperty({ type: Number, enum: [400] })
  statusCode!: 400;

  @ApiProperty({ type: String, enum: ['VALIDATION_ERROR'] })
  code!: 'VALIDATION_ERROR';

  @ApiProperty({ type: String })
  message!: string;

  @ApiProperty({ type: () => ProfileValidationErrorDetailsDto })
  details!: ProfileValidationErrorDetailsDto;
}

export class ProfileBusinessValidationErrorDetailsDto {
  @ApiProperty({
    type: String,
    enum: ['nickname', 'birthDate', 'showAge', 'bio'],
  })
  field!: 'nickname' | 'birthDate' | 'showAge' | 'bio';
}

export class ProfileBusinessValidationErrorResponseDto {
  @ApiProperty({ type: Number, enum: [400] })
  statusCode!: 400;

  @ApiProperty({ type: String, enum: ['PROFILE_VALIDATION_FAILED'] })
  code!: 'PROFILE_VALIDATION_FAILED';

  @ApiProperty({ type: String })
  message!: string;

  @ApiProperty({ type: () => ProfileBusinessValidationErrorDetailsDto })
  details!: ProfileBusinessValidationErrorDetailsDto;
}

export class ProfileAvatarInvalidErrorResponseDto {
  @ApiProperty({ type: Number, enum: [400] })
  statusCode!: 400;

  @ApiProperty({ type: String, enum: ['AVATAR_INVALID'] })
  code!: 'AVATAR_INVALID';

  @ApiProperty({ type: String })
  message!: string;
}

export class ProfileMultipartInvalidErrorResponseDto {
  @ApiProperty({ type: Number, enum: [400] })
  statusCode!: 400;

  @ApiProperty({ type: String, enum: ['MULTIPART_INVALID'] })
  code!: 'MULTIPART_INVALID';

  @ApiProperty({ type: String })
  message!: string;
}

export class ProfileAuthenticationRequiredErrorResponseDto {
  @ApiProperty({ type: Number, enum: [401] })
  statusCode!: 401;

  @ApiProperty({ type: String, enum: ['AUTHENTICATION_REQUIRED'] })
  code!: 'AUTHENTICATION_REQUIRED';

  @ApiProperty({ type: String })
  message!: string;
}

export class ProfileAvatarTooLargeErrorResponseDto {
  @ApiProperty({ type: Number, enum: [413] })
  statusCode!: 413;

  @ApiProperty({ type: String, enum: ['AVATAR_TOO_LARGE'] })
  code!: 'AVATAR_TOO_LARGE';

  @ApiProperty({ type: String })
  message!: string;
}

export class ProfileVersionConflictErrorResponseDto {
  @ApiProperty({ type: Number, enum: [409] })
  statusCode!: 409;

  @ApiProperty({ type: String, enum: ['PROFILE_VERSION_CONFLICT'] })
  code!: 'PROFILE_VERSION_CONFLICT';

  @ApiProperty({ type: String })
  message!: string;
}

export class ProfileSaveFailedErrorResponseDto {
  @ApiProperty({ type: Number, enum: [500] })
  statusCode!: 500;

  @ApiProperty({ type: String, enum: ['PROFILE_SAVE_FAILED'] })
  code!: 'PROFILE_SAVE_FAILED';

  @ApiProperty({ type: String })
  message!: string;
}
