import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ChannelRecord, PublicChannelList } from './channels.types.js';

const CHANNEL_CODE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

@Injectable()
export class ChannelsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listPublic(publishableOnly = false): Promise<PublicChannelList> {
    const items = await this.prisma.channel.findMany({
      where: {
        enabled: true,
        isPublic: true,
        ...(publishableOnly ? { publishable: true } : {}),
      },
      orderBy: { displayOrder: 'asc' },
      select: { code: true, name: true, displayOrder: true },
    });
    return { items };
  }

  async requirePublishable(code: string): Promise<ChannelRecord> {
    const channel = await this.findByCode(code);
    if (
      !channel ||
      !channel.enabled ||
      !channel.isPublic ||
      !channel.publishable
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'CHANNEL_INVALID',
        '所选频道不存在或暂不可发布',
      );
    }
    return channel;
  }

  async requirePublic(code: string): Promise<ChannelRecord> {
    const channel = await this.findByCode(code);
    if (!channel || !channel.enabled || !channel.isPublic) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'CHANNEL_NOT_FOUND',
        '频道不存在或已停用',
      );
    }
    return channel;
  }

  private async findByCode(code: string): Promise<ChannelRecord | null> {
    if (!CHANNEL_CODE_PATTERN.test(code)) {
      return null;
    }
    return this.prisma.channel.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        displayOrder: true,
        enabled: true,
        publishable: true,
        isPublic: true,
      },
    });
  }
}
