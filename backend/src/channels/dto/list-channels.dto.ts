import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ListChannelsDto {
  @ApiPropertyOptional({
    enum: ['navigation', 'publish'],
    default: 'navigation',
    description:
      'Use publish to exclude enabled public channels that do not accept new notes',
  })
  @IsOptional()
  @IsIn(['navigation', 'publish'])
  purpose: 'navigation' | 'publish' = 'navigation';
}
