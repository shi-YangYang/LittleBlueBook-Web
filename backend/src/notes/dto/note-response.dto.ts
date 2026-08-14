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

class NoteManagementResponseDto {
  @ApiProperty({ type: Number, minimum: 1 })
  contentVersion!: number;
}

class NoteCardResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, enum: ['IMAGE', 'VIDEO'] })
  contentType!: 'IMAGE' | 'VIDEO';

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

  @ApiProperty({ type: Number, minimum: 0 })
  views!: number;

  @ApiProperty({ type: Number, nullable: true, minimum: 1000 })
  videoDurationMs!: number | null;

  @ApiProperty({
    type: () => NoteManagementResponseDto,
    required: false,
    description: 'Author-only management data, only returned by the mine feed',
  })
  management?: { contentVersion: number };
}

class NotePageDto {
  @ApiProperty({ type: () => NoteCardResponseDto, isArray: true })
  items!: NoteCardResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;

  @ApiProperty({
    type: String,
    enum: ['NO_FOLLOWS', 'NO_NOTES'],
    required: false,
    description: 'Following-feed initial empty-state reason',
  })
  emptyReason?: 'NO_FOLLOWS' | 'NO_NOTES';
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

  @ApiProperty({ type: Number, minimum: 0 })
  views!: number;
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

  @ApiProperty({ type: String, enum: ['IMAGE', 'VIDEO'] })
  contentType!: 'IMAGE' | 'VIDEO';

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  editedAt!: string | null;

  @ApiProperty({ type: () => NoteAuthorResponseDto })
  author!: NoteAuthorResponseDto;

  @ApiProperty({ type: () => NoteChannelResponseDto, nullable: true })
  channel!: NoteChannelResponseDto | null;

  @ApiProperty({ type: () => NoteImageResponseDto, isArray: true })
  images!: NoteImageResponseDto[];

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Video stream, poster and dimensions for VIDEO notes',
  })
  video!: {
    url: string;
    posterUrl: string;
    width: number;
    height: number;
    durationMs: number;
  } | null;

  @ApiProperty({ type: () => NoteInteractionsResponseDto })
  interactions!: NoteInteractionsResponseDto;

  @ApiProperty({ type: () => NoteViewerResponseDto })
  viewer!: NoteViewerResponseDto;

  @ApiProperty({ type: () => NoteManagementResponseDto, nullable: true })
  management!: { contentVersion: number } | null;
}

export class NoteDetailResponseDto {
  @ApiProperty({ type: () => NoteDetailDto })
  data!: NoteDetailDto;
}

class NoteViewResultDto {
  @ApiProperty({ type: Boolean })
  counted!: boolean;

  @ApiProperty({ type: Number, minimum: 0 })
  viewCount!: number;
}

export class NoteViewResponseDto {
  @ApiProperty({ type: () => NoteViewResultDto })
  data!: NoteViewResultDto;
}

class EditableNoteChannelDto {
  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Boolean })
  publishable!: boolean;
}

class EditableNoteImageDto extends NoteImageResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
}

class EditableNoteVideoDto {
  @ApiProperty({ type: String, format: 'uri' })
  url!: string;

  @ApiProperty({ type: String, format: 'uri' })
  posterUrl!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  width!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  height!: number;

  @ApiProperty({ type: Number, minimum: 1000 })
  durationMs!: number;
}

class EditableNoteDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, enum: ['IMAGE', 'VIDEO'] })
  contentType!: 'IMAGE' | 'VIDEO';

  @ApiProperty({ type: String, minLength: 1, maxLength: 50 })
  title!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 2000 })
  content!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  contentVersion!: number;

  @ApiProperty({ type: () => EditableNoteChannelDto })
  channel!: EditableNoteChannelDto;

  @ApiProperty({ type: () => EditableNoteImageDto, isArray: true })
  images!: EditableNoteImageDto[];

  @ApiProperty({ type: () => EditableNoteVideoDto, nullable: true })
  video!: EditableNoteVideoDto | null;
}

export class EditableNoteResponseDto {
  @ApiProperty({ type: () => EditableNoteDto })
  data!: EditableNoteDto;
}

class NoteMutationResultDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: Number, minimum: 2 })
  contentVersion!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  editedAt!: string;
}

export class NoteMutationResponseDto {
  @ApiProperty({ type: () => NoteMutationResultDto })
  data!: NoteMutationResultDto;
}

class NoteDeletionResultDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: Boolean, enum: [true] })
  deleted!: true;
}

export class NoteDeletionResponseDto {
  @ApiProperty({ type: () => NoteDeletionResultDto })
  data!: NoteDeletionResultDto;
}
