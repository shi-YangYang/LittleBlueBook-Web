import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListMessagesDto {
  @ApiPropertyOptional({ description: 'Opaque cursor for older messages' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Opaque cursor used to sync newer messages',
  })
  @IsOptional()
  @IsString()
  after?: string;
}
