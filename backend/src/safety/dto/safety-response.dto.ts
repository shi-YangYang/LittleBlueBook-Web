import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ProfileAvatarDto } from '../../profile/dto/profile-avatar.dto.js';
import {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from './safety.dto.js';

export class SafetyApiErrorDto {
  @ApiProperty({ type: Number, example: 404, minimum: 400, maximum: 599 })
  statusCode!: number;

  @ApiProperty({ type: String, example: 'USER_NOT_FOUND' })
  code!: string;

  @ApiProperty({ type: String, example: '用户不存在' })
  message!: string;

  @ApiPropertyOptional({ type: Object })
  details?: unknown;
}

export class ReportItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: REPORT_TARGET_TYPES })
  targetType!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  targetId!: string;

  @ApiProperty({ enum: REPORT_REASONS })
  reason!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 200 })
  details!: string | null;

  @ApiProperty({ enum: REPORT_STATUSES })
  status!: string;

  @ApiProperty({
    enum: ['处理中', '已采取措施', '未发现违规', '目标已失效'],
  })
  result!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class ReportResponseDto {
  @ApiProperty({ type: () => ReportItemDto })
  data!: ReportItemDto;
}

export class ReportPageDto {
  @ApiProperty({ type: () => [ReportItemDto] })
  items!: ReportItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class ReportPageResponseDto {
  @ApiProperty({ type: () => ReportPageDto })
  data!: ReportPageDto;
}

export class BlockStateDto {
  @ApiProperty({ type: Boolean })
  blocked!: boolean;
}

export class BlockStateResponseDto {
  @ApiProperty({ type: () => BlockStateDto })
  data!: BlockStateDto;
}

export class BlockedUserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: String })
  littleBlueBookId!: string;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;

  @ApiProperty({ type: String, format: 'date-time' })
  blockedAt!: string;
}

export class BlockedUserPageDto {
  @ApiProperty({ type: () => [BlockedUserDto] })
  items!: BlockedUserDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class BlockedUserPageResponseDto {
  @ApiProperty({ type: () => BlockedUserPageDto })
  data!: BlockedUserPageDto;
}

export class AdminReporterDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  nickname!: string;

  @ApiProperty({ type: String })
  littleBlueBookId!: string;

  @ApiProperty({ type: () => ProfileAvatarDto })
  avatar!: ProfileAvatarDto;
}

export class AdminTargetSummaryDto {
  @ApiProperty({ type: Boolean })
  available!: boolean;

  @ApiProperty({ type: String, nullable: true })
  label!: string | null;

  @ApiProperty({ type: String })
  state!: string;
}

export class AdminReportItemDto extends ReportItemDto {
  @ApiProperty({ type: () => AdminReporterDto })
  reporter!: AdminReporterDto;

  @ApiProperty({ type: () => AdminTargetSummaryDto })
  target!: AdminTargetSummaryDto;
}

export class AdminReportPageDto {
  @ApiProperty({ type: () => [AdminReportItemDto] })
  items!: AdminReportItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class AdminReportPageResponseDto {
  @ApiProperty({ type: () => AdminReportPageDto })
  data!: AdminReportPageDto;
}

export class ModerationResultDto {
  @ApiProperty({ type: Boolean })
  changed!: boolean;

  @ApiProperty({ type: String })
  state!: string;
}

export class ModerationResultResponseDto {
  @ApiProperty({ type: () => ModerationResultDto })
  data!: ModerationResultDto;
}

export class DismissedReportDto {
  @ApiProperty({ enum: ['DISMISSED'] })
  status!: 'DISMISSED';
}

export class DismissedReportResponseDto {
  @ApiProperty({ type: () => DismissedReportDto })
  data!: DismissedReportDto;
}
