import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InteractionApiErrorDto {
  @ApiProperty({ type: Number, example: 401, minimum: 400, maximum: 599 })
  statusCode!: number;

  @ApiProperty({ type: String, example: 'AUTHENTICATION_REQUIRED' })
  code!: string;

  @ApiProperty({ type: String, example: '请先登录' })
  message!: string;

  @ApiPropertyOptional({
    description: 'Optional safe validation or business error details',
    type: Object,
  })
  details?: unknown;
}

export class RelationshipResultDto {
  @ApiProperty({
    type: Boolean,
    description: 'The final relationship state',
  })
  active!: boolean;

  @ApiProperty({
    type: Number,
    description: 'The authoritative relationship count for the note',
    minimum: 0,
    example: 1,
  })
  count!: number;
}

export class RelationshipResponseDto {
  @ApiProperty({ type: () => RelationshipResultDto })
  data!: RelationshipResultDto;
}

export class FollowResultDto {
  @ApiProperty({ type: Boolean, description: 'The final follow state' })
  following!: boolean;
}

export class FollowResponseDto {
  @ApiProperty({ type: () => FollowResultDto })
  data!: FollowResultDto;
}

export class CommentAvatarDto {
  @ApiProperty({ type: String, enum: ['initial'], example: 'initial' })
  type!: 'initial';

  @ApiProperty({ type: String, example: '蓝' })
  value!: string;
}

export class CommentAuthorDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, example: '蓝书用户' })
  nickname!: string;

  @ApiProperty({ type: () => CommentAvatarDto })
  avatar!: CommentAvatarDto;
}

export class NoteCommentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, example: '很有帮助，感谢分享！' })
  content!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: () => CommentAuthorDto })
  author!: CommentAuthorDto;

  @ApiProperty({
    type: Boolean,
    description: 'Whether the commenter authored the note',
  })
  isAuthor!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Whether the current viewer may delete this comment',
  })
  canDelete!: boolean;
}

export class CommentPageDto {
  @ApiProperty({ type: () => NoteCommentDto, isArray: true })
  items!: NoteCommentDto[];

  @ApiProperty({
    description: 'Opaque cursor for the next page',
    type: String,
    nullable: true,
    example: null,
  })
  nextCursor!: string | null;

  @ApiProperty({ type: Number, minimum: 0, example: 1 })
  total!: number;
}

export class CommentPageResponseDto {
  @ApiProperty({ type: () => CommentPageDto })
  data!: CommentPageDto;
}

export class CommentMutationResultDto {
  @ApiProperty({ type: () => NoteCommentDto })
  comment!: NoteCommentDto;

  @ApiProperty({ type: Number, minimum: 0, example: 1 })
  total!: number;
}

export class CommentMutationResponseDto {
  @ApiProperty({ type: () => CommentMutationResultDto })
  data!: CommentMutationResultDto;
}

export class CommentDeletionResultDto {
  @ApiProperty({ type: Boolean, enum: [true], example: true })
  deleted!: true;

  @ApiProperty({ type: Number, minimum: 0, example: 0 })
  total!: number;
}

export class CommentDeletionResponseDto {
  @ApiProperty({ type: () => CommentDeletionResultDto })
  data!: CommentDeletionResultDto;
}
