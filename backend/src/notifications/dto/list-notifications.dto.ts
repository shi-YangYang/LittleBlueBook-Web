import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import type { NotificationTab } from '../notifications.types.js';

export class ListNotificationsDto {
  @ApiPropertyOptional({
    enum: ['all', 'comments', 'reactions', 'follows'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'comments', 'reactions', 'follows'])
  tab: NotificationTab = 'all';

  @ApiPropertyOptional({
    description: 'Opaque cursor returned by the previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 20;
}
