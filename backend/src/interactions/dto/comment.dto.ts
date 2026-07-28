import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CommentDto {
  @ApiProperty({
    description: 'Plain-text comment content',
    minLength: 1,
    maxLength: 500,
    example: '很有帮助，感谢分享！',
  })
  @IsString()
  content!: string;
}
