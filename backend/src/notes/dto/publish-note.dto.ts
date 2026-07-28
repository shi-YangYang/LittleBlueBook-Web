import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class PublishNoteDto {
  @ApiProperty({ minLength: 1, maxLength: 50 })
  @IsString()
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'Stable public channel code',
    example: 'digital',
    minLength: 2,
    maxLength: 32,
  })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,31}$/)
  channelCode!: string;

  @ApiProperty({
    description: 'Stable client-generated UUID used to prevent duplicates',
  })
  @IsUUID('4')
  clientRequestId!: string;
}
