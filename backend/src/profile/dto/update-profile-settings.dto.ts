import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateProfileSettingsDto {
  @ApiProperty({ minLength: 2, maxLength: 20 })
  @IsString()
  nickname!: string;

  @ApiProperty({ enum: ['MALE', 'FEMALE', 'PRIVATE'] })
  @IsString()
  @IsIn(['MALE', 'FEMALE', 'PRIVATE'])
  gender!: 'MALE' | 'FEMALE' | 'PRIVATE';

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'An empty string clears the date',
  })
  @IsString()
  birthDate!: string;

  @ApiProperty({ enum: ['true', 'false'] })
  @IsString()
  @IsIn(['true', 'false'])
  showAge!: 'true' | 'false';

  @ApiProperty({
    type: String,
    maxLength: 100,
    nullable: true,
    description: 'An empty string clears the biography',
  })
  @IsString()
  bio!: string;

  @ApiProperty({ enum: ['keep', 'replace', 'delete'] })
  @IsString()
  @IsIn(['keep', 'replace', 'delete'])
  avatarAction!: 'keep' | 'replace' | 'delete';

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  profileVersion!: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$' })
  @IsOptional()
  @IsString()
  cropLeft?: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$' })
  @IsOptional()
  @IsString()
  cropTop?: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$' })
  @IsOptional()
  @IsString()
  cropSize?: string;
}
