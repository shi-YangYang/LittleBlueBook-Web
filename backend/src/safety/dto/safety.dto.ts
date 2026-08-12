import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const REPORT_TARGET_TYPES = ['NOTE', 'COMMENT', 'USER'] as const;
export const REPORT_REASONS = [
  'SEXUAL',
  'VIOLENCE',
  'HATE',
  'HARASSMENT',
  'PERSONAL_ATTACK',
  'SPAM',
  'INFRINGEMENT',
  'OTHER',
] as const;
export const REPORT_STATUSES = [
  'PENDING',
  'ACTIONED',
  'DISMISSED',
  'TARGET_UNAVAILABLE',
] as const;
export const MODERATION_ACTIONS = [
  'HIDE_NOTE',
  'RESTORE_NOTE',
  'HIDE_COMMENT',
  'RESTORE_COMMENT',
  'SUSPEND_USER',
  'RESTORE_USER',
] as const;

export class CreateReportDto {
  @IsEnum(REPORT_TARGET_TYPES)
  targetType!: (typeof REPORT_TARGET_TYPES)[number];

  @IsUUID()
  targetId!: string;

  @IsEnum(REPORT_REASONS)
  reason!: (typeof REPORT_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  details?: string;
}

export class ListReportsDto {
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class AdminListReportsDto extends ListReportsDto {
  @IsOptional()
  @IsEnum(REPORT_TARGET_TYPES)
  targetType?: (typeof REPORT_TARGET_TYPES)[number];

  @IsOptional()
  @IsEnum(REPORT_STATUSES)
  status?: (typeof REPORT_STATUSES)[number];
}

export class ModerationReasonDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ModerationActionDto extends ModerationReasonDto {
  @IsEnum(MODERATION_ACTIONS)
  action!: (typeof MODERATION_ACTIONS)[number];

  @IsEnum(REPORT_TARGET_TYPES)
  targetType!: (typeof REPORT_TARGET_TYPES)[number];

  @IsUUID()
  targetId!: string;
}
