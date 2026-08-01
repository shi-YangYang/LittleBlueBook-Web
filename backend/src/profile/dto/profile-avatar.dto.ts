import { ApiProperty } from '@nestjs/swagger';

export class ProfileAvatarDto {
  @ApiProperty({
    type: String,
    enum: ['initial', 'image'],
    description:
      'The fallback initial discriminator or an immutable public image URL discriminator',
  })
  type!: 'initial' | 'image';

  @ApiProperty({
    type: String,
    description:
      'One Unicode initial when type is initial; a public media URL when type is image',
  })
  value!: string;
}
