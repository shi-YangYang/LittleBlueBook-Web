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

  async get(key: string): Promise<string | null> {
    await this.connect();
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    options?: { expirationSeconds?: number },
  ): Promise<void> {
    await this.connect();
    await this.client.set(key, value, {
      ...(options?.expirationSeconds
        ? { expiration: { type: 'EX', value: options.expirationSeconds } }
        : {}),
    });
  }

  async getDel(key: string): Promise<string | null> {
    await this.connect();
    return this.client.getDel(key);
  }

  async del(key: string): Promise<void> {
    await this.connect();
    await this.client.del(key);
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    await this.connect();
    return this.client.eval(script, {
      keys,
      arguments: args,
    });
  }

  private async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
