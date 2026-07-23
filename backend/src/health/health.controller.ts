import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

type HealthResponse = {
  status: 'ok';
  service: 'backend';
};

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check whether the backend process is alive' })
  @ApiOkResponse({
    schema: {
      example: { status: 'ok', service: 'backend' },
    },
  })
  live(): HealthResponse {
    return {
      status: 'ok',
      service: 'backend',
    };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check required backend dependencies' })
  @ApiOkResponse({
    schema: {
      example: { status: 'ok', service: 'backend' },
    },
  })
  @ApiServiceUnavailableResponse({
    schema: {
      example: { status: 'error', service: 'backend' },
    },
  })
  async ready(): Promise<HealthResponse> {
    try {
      await Promise.all([this.prisma.ping(), this.redis.ping()]);

      return {
        status: 'ok',
        service: 'backend',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'backend',
      });
    }
  }
}
