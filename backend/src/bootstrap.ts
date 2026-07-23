import { RequestMethod, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import type { AppEnvironment } from './config/environment.js';

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppEnvironment, true>);

  app.enableShutdownHooks();
  app.enableCors({
    origin: config.getOrThrow('FRONTEND_ORIGIN'),
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  if (
    config.getOrThrow('NODE_ENV') !== 'production' &&
    config.getOrThrow('SWAGGER_ENABLED')
  ) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LittleBlueBook API')
      .setDescription('LittleBlueBook Web backend API')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs-json',
    });
  }

  return app;
}
