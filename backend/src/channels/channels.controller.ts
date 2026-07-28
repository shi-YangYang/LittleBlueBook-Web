import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ChannelsService } from './channels.service.js';
import type { PublicChannelList } from './channels.types.js';
import { ListChannelsDto } from './dto/list-channels.dto.js';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(
    @Inject(ChannelsService) private readonly channels: ChannelsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List enabled public note channels in display order',
  })
  @ApiOkResponse({
    description: 'Public channel codes and display names',
    schema: {
      type: 'object',
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'name', 'displayOrder'],
                additionalProperties: false,
                properties: {
                  code: {
                    type: 'string',
                    pattern: '^[a-z][a-z0-9-]{1,31}$',
                    example: 'digital',
                  },
                  name: { type: 'string', example: '数码' },
                  displayOrder: { type: 'integer', minimum: 1, example: 1 },
                },
              },
            },
          },
        },
      },
    },
  })
  async list(
    @Query() query: ListChannelsDto,
  ): Promise<{ data: PublicChannelList }> {
    return {
      data: await this.channels.listPublic(query.purpose === 'publish'),
    };
  }
}
