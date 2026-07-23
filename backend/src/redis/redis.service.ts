import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

import type { AppEnvironment } from '../config/environment.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisClientType;

  constructor(
    @Inject(ConfigService) config: ConfigService<AppEnvironment, true>,
  ) {
    this.client = createClient({
      url: config.getOrThrow('REDIS_URL'),
      socket: {
        reconnectStrategy: false,
      },
    });

    this.client.on('error', () => {
      // Connection details are deliberately omitted. Readiness reports the state.
    });
  }

  async ping(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }

    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
