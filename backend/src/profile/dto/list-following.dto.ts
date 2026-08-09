import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListFollowingDto {
  @IsOptional()
  @IsString()
  @MaxLength(768)
  cursor?: string;
}
