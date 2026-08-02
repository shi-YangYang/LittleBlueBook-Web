import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ProfileAvatarDto } from '../../profile/dto/profile-avatar.dto.js';

class MessageUserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;
}

class DirectMessageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  senderId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 1000 })
  content!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: Boolean })
  mine!: boolean;

  @ApiProperty({ type: Boolean })
  read!: boolean;
}

class ConversationSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: () => MessageUserDto })
  opponent!: MessageUserDto;

  @ApiProperty({ type: () => DirectMessageDto })
  lastMessage!: DirectMessageDto;

  @ApiProperty({ type: Number, minimum: 0 })
  unreadCount!: number;

  @ApiProperty({ type: Boolean })
  canSend!: boolean;
}

class ConversationPageDto {
  @ApiProperty({ type: () => ConversationSummaryDto, isArray: true })
  items!: ConversationSummaryDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

class ConversationDetailDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: () => MessageUserDto })
  opponent!: MessageUserDto;

  @ApiProperty({ type: Boolean })
  canSend!: boolean;
}

class MessagePageDto {
  @ApiProperty({ type: () => DirectMessageDto, isArray: true })
  items!: DirectMessageDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ type: String, nullable: true })
  syncCursor!: string | null;

  @ApiProperty({ type: Boolean })
  hasMoreAfter!: boolean;
}

class SendMessageResultDto {
  @ApiProperty({ type: String, format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ type: () => DirectMessageDto })
  message!: DirectMessageDto;
}

class ReadMessageResultDto {
  @ApiProperty({ type: String, format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  messageId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readAt!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  unreadCount!: number;
}

class MessageUnreadCountDto {
  @ApiProperty({ type: Number, minimum: 0 })
  unreadCount!: number;
}

export class ConversationPageResponseDto {
  @ApiProperty({ type: () => ConversationPageDto })
  data!: ConversationPageDto;
}

export class ConversationDetailResponseDto {
  @ApiProperty({ type: () => ConversationDetailDto })
  data!: ConversationDetailDto;
}

export class MessagePageResponseDto {
  @ApiProperty({ type: () => MessagePageDto })
  data!: MessagePageDto;
}

export class SendMessageResponseDto {
  @ApiProperty({ type: () => SendMessageResultDto })
  data!: SendMessageResultDto;
}

export class ReadMessageResponseDto {
  @ApiProperty({ type: () => ReadMessageResultDto })
  data!: ReadMessageResultDto;
}

export class MessageUnreadCountResponseDto {
  @ApiProperty({ type: () => MessageUnreadCountDto })
  data!: MessageUnreadCountDto;
}

export class MessageApiErrorDto {
  @ApiProperty({ type: Number, minimum: 400, maximum: 599 })
  statusCode!: number;

  @ApiProperty({ type: String, example: 'AUTHENTICATION_REQUIRED' })
  code!: string;

  @ApiProperty({ type: String, example: '请先登录' })
  message!: string;

  @ApiPropertyOptional({ type: Object })
  details?: unknown;
}
