import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 1000 })
  @IsString()
  content!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  clientRequestId!: string;
}
