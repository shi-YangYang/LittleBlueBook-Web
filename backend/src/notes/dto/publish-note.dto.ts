import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class PublishNoteDto {
  @ApiProperty({ minLength: 1, maxLength: 50 })
  @IsString()
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'Stable client-generated UUID used to prevent duplicates',
  })
  @IsUUID('4')
  clientRequestId!: string;
}
