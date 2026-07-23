import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';

import { createApplication } from './bootstrap.js';
import type { AppEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get(ConfigService<AppEnvironment, true>);

  await app.listen(config.getOrThrow('PORT'), '0.0.0.0');
}

void bootstrap();
