import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class NotificationAvatarDto {
  @ApiProperty({ type: String, enum: ['initial'], example: 'initial' })
  type!: 'initial';

  @ApiProperty({ type: String, example: '蓝' })
  value!: string;
}

class NotificationActorDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  id!: string | null;

  @ApiProperty({ type: String, example: '蓝书用户' })
  nickname!: string;

  @ApiProperty({
    type: String,
    pattern: '^\\d{10}$',
    nullable: true,
  })
  littleBlueBookId!: string | null;

  @ApiProperty({ type: () => NotificationAvatarDto })
  avatar!: NotificationAvatarDto;
}

class NotificationThumbnailDto {
  @ApiProperty({ type: String, format: 'uri' })
  url!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  width!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  height!: number;
}

class NotificationNoteDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: () => NotificationThumbnailDto, nullable: true })
  thumbnail!: NotificationThumbnailDto | null;
}

class NotificationCommentDto {
  @ApiProperty({ type: String, nullable: true })
  preview!: string | null;

  @ApiProperty({ type: Boolean })
  deleted!: boolean;
}

class NotificationItemDto {
  @ApiProperty({
    type: String,
    enum: ['NOTE_LIKED', 'NOTE_FAVORITED', 'NOTE_COMMENTED', 'USER_FOLLOWED'],
  })
  type!: 'NOTE_LIKED' | 'NOTE_FAVORITED' | 'NOTE_COMMENTED' | 'USER_FOLLOWED';

  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, example: '赞了你的笔记' })
  action!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: string | null;

  @ApiProperty({ type: () => NotificationActorDto })
  actor!: NotificationActorDto;

  @ApiProperty({ type: () => NotificationNoteDto, nullable: true })
  note!: NotificationNoteDto | null;

  @ApiProperty({ type: () => NotificationCommentDto, nullable: true })
  comment!: NotificationCommentDto | null;
}

class NotificationPageDto {
  @ApiProperty({ type: () => NotificationItemDto, isArray: true })
  items!: NotificationItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

class UnreadCountDto {
  @ApiProperty({ type: Number, minimum: 0 })
  unreadCount!: number;
}

class ReadNotificationDto extends UnreadCountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readAt!: string;
}

class ReadAllNotificationsDto extends UnreadCountDto {
  @ApiProperty({ type: Number, minimum: 0 })
  updatedCount!: number;
}

export class NotificationPageResponseDto {
  @ApiProperty({ type: () => NotificationPageDto })
  data!: NotificationPageDto;
}

export class UnreadCountResponseDto {
  @ApiProperty({ type: () => UnreadCountDto })
  data!: UnreadCountDto;
}

export class ReadNotificationResponseDto {
  @ApiProperty({ type: () => ReadNotificationDto })
  data!: ReadNotificationDto;
}

export class ReadAllNotificationsResponseDto {
  @ApiProperty({ type: () => ReadAllNotificationsDto })
  data!: ReadAllNotificationsDto;
}

export class NotificationApiErrorDto {
  @ApiProperty({ type: Number, minimum: 400, maximum: 599 })
  statusCode!: number;

  @ApiProperty({ type: String, example: 'AUTHENTICATION_REQUIRED' })
  code!: string;

  @ApiProperty({ type: String, example: '请先登录' })
  message!: string;

  @ApiPropertyOptional({ type: Object })
  details?: unknown;
}
