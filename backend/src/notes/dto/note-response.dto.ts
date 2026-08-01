import { ApiProperty } from '@nestjs/swagger';

import { ProfileAvatarDto } from '../../profile/dto/profile-avatar.dto.js';

class NoteAuthorResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;
}

class NoteImageResponseDto {
  @ApiProperty({ type: String, format: 'uri' })
  url!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  width!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  height!: number;
}

class NoteCardResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: () => NoteImageResponseDto })
  cover!: NoteImageResponseDto;

  @ApiProperty({ type: () => NoteAuthorResponseDto })
  author!: NoteAuthorResponseDto;

  @ApiProperty({ type: Number, minimum: 0 })
  likes!: number;

  @ApiProperty({ type: Boolean })
  liked!: boolean;

  @ApiProperty({ type: Boolean })
  canLike!: boolean;
}

class NotePageDto {
  @ApiProperty({ type: () => NoteCardResponseDto, isArray: true })
  items!: NoteCardResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class NotePageResponseDto {
  @ApiProperty({ type: () => NotePageDto })
  data!: NotePageDto;
}

class PublishNoteResultDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class PublishNoteResponseDto {
  @ApiProperty({ type: () => PublishNoteResultDto })
  data!: PublishNoteResultDto;
}

class NoteChannelResponseDto {
  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Boolean })
  navigable!: boolean;
}

class NoteInteractionsResponseDto {
  @ApiProperty({ type: Number, minimum: 0 })
  likes!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  favorites!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  comments!: number;
}

class NoteViewerResponseDto {
  @ApiProperty({ type: Boolean })
  authenticated!: boolean;

  @ApiProperty({ type: Boolean })
  isAuthor!: boolean;

  @ApiProperty({ type: Boolean })
  liked!: boolean;

  @ApiProperty({ type: Boolean })
  favorited!: boolean;

  @ApiProperty({ type: Boolean })
  followingAuthor!: boolean;

  @ApiProperty({ type: Boolean })
  canLike!: boolean;

  @ApiProperty({ type: Boolean })
  canFollow!: boolean;
}

class NoteDetailDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: () => NoteAuthorResponseDto })
  author!: NoteAuthorResponseDto;

  @ApiProperty({ type: () => NoteChannelResponseDto, nullable: true })
  channel!: NoteChannelResponseDto | null;

  @ApiProperty({ type: () => NoteImageResponseDto, isArray: true })
  images!: NoteImageResponseDto[];

  @ApiProperty({ type: () => NoteInteractionsResponseDto })
  interactions!: NoteInteractionsResponseDto;

  @ApiProperty({ type: () => NoteViewerResponseDto })
  viewer!: NoteViewerResponseDto;
}

export class NoteDetailResponseDto {
  @ApiProperty({ type: () => NoteDetailDto })
  data!: NoteDetailDto;
}
