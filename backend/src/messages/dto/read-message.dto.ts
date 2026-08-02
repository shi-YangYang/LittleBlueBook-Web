import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ReadMessageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  messageId!: string;
}
