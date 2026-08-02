import { ApiProperty } from '@nestjs/swagger';

import { ProfileAvatarDto } from '../../profile/dto/profile-avatar.dto.js';

class NoteAuthorDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;
}

class NoteCoverDto {
  @ApiProperty({ type: String, format: 'uri' })
  url!: string;

  @ApiProperty({ type: Number })
  width!: number;

  @ApiProperty({ type: Number })
  height!: number;
}

class SearchNoteCardDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: () => NoteCoverDto })
  cover!: NoteCoverDto;

  @ApiProperty({ type: () => NoteAuthorDto })
  author!: NoteAuthorDto;

  @ApiProperty({ type: Number, minimum: 0 })
  likes!: number;

  @ApiProperty({ type: Boolean })
  liked!: boolean;

  @ApiProperty({ type: Boolean })
  canLike!: boolean;

  @ApiProperty({ type: Number, minimum: 0 })
  views!: number;
}

class SearchViewerDto {
  @ApiProperty({ type: Boolean })
  authenticated!: boolean;

  @ApiProperty({ type: Boolean })
  isSelf!: boolean;

  @ApiProperty({ type: Boolean })
  following!: boolean;

  @ApiProperty({ type: Boolean })
  canFollow!: boolean;
}

class PublicProfileViewerDto extends SearchViewerDto {
  @ApiProperty({ type: Boolean })
  canMessage!: boolean;
}

class SearchUserCardDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({
    type: String,
    pattern: '^\\d{10}$',
    description: 'Public ten-digit LittleBlueBook ID',
  })
  littleBlueBookId!: string;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;

  @ApiProperty({ type: Number, minimum: 0 })
  followers!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  notes!: number;

  @ApiProperty({ type: () => SearchViewerDto })
  viewer!: SearchViewerDto;
}

export class SearchNotePageDto {
  @ApiProperty({ type: () => SearchNoteCardDto, isArray: true })
  items!: SearchNoteCardDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class SearchUserPageDto {
  @ApiProperty({ type: () => SearchUserCardDto, isArray: true })
  items!: SearchUserCardDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class EmptyVideoPageDto {
  @ApiProperty({ type: 'array', items: {}, maxItems: 0 })
  items!: [];

  @ApiProperty({ type: 'string', nullable: true, example: null })
  nextCursor!: null;
}

export class SearchNotePageResponseDto {
  @ApiProperty({ type: () => SearchNotePageDto })
  data!: SearchNotePageDto;
}

export class SearchUserPageResponseDto {
  @ApiProperty({ type: () => SearchUserPageDto })
  data!: SearchUserPageDto;
}

export class EmptyVideoPageResponseDto {
  @ApiProperty({ type: () => EmptyVideoPageDto })
  data!: EmptyVideoPageDto;
}

class PublicProfileStatsDto {
  @ApiProperty({ type: Number, minimum: 0 })
  following!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  followers!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  receivedLikesAndFavorites!: number;
}

export class PublicUserProfileDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: String, pattern: '^\\d{10}$' })
  littleBlueBookId!: string;

  @ApiProperty({ type: String, enum: ['男', '女', '保密'] })
  gender!: '男' | '女' | '保密';

  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 120 })
  age!: number | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 100 })
  bio!: string | null;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;

  @ApiProperty({ type: () => PublicProfileStatsDto })
  stats!: PublicProfileStatsDto;

  @ApiProperty({ type: () => PublicProfileViewerDto })
  viewer!: PublicProfileViewerDto;
}

export class PublicUserProfileResponseDto {
  @ApiProperty({ type: () => PublicUserProfileDto })
  data!: PublicUserProfileDto;
}
