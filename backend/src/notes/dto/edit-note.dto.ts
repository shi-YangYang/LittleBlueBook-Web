import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class EditNoteDto {
  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,31}$/)
  channelCode!: string;

  @IsEnum(['IMAGE', 'VIDEO'])
  contentType!: 'IMAGE' | 'VIDEO';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedContentVersion!: number;

  @IsOptional()
  @IsString()
  imageOrder?: string;
}

export class DeleteNoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedContentVersion!: number;
}
