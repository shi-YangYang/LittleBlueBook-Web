import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: '蓝书用户' })
  @Matches(/^[\u3400-\u9fffA-Za-z0-9_]{2,20}$/u)
  nickname!: string;
}
