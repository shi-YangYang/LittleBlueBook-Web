import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail } from 'class-validator';

import { normalizeEmail } from '../email.js';

export class RequestCodeDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true)
  acceptedTerms!: true;
}
