import {
  RequestMethod,
  ValidationPipe,
  type INestApplication,
  type ValidationError,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { ApiException } from './common/api-exception.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import type { AppEnvironment } from './config/environment.js';

function validationMessage(errors: ValidationError[]): string {
  const fields = new Set(errors.map((error) => error.property));

  if (fields.has('acceptedTerms')) {
    return '请先阅读并同意用户协议与隐私政策';
  }
  if (fields.has('email')) {
    return '请输入有效的邮箱地址';
  }
  if (fields.has('nickname')) {
    return '昵称需为2～20个中文、字母、数字或下划线';
  }
  if (fields.has('code')) {
    return '请输入6位数字验证码';
  }
  if (fields.has('title')) {
    return '标题需为1～50个字符';
  }
  if (fields.has('content')) {
    return '正文需为1～2000个字符';
  }
  if (fields.has('channelCode')) {
    return '请选择有效频道';
  }
  if (fields.has('clientRequestId')) {
    return '发布请求标识无效';
  }
  if (fields.has('cursor') || fields.has('limit')) {
    return '分页参数无效';
  }
  return '请求参数无效';
}

function allowedFrontendOrigins(
  configuredOrigin: string,
  environment: AppEnvironment['NODE_ENV'],
): string | string[] {
  if (environment === 'production') {
    return configuredOrigin;
  }

  const origin = new URL(configuredOrigin);
  const origins = new Set([origin.origin]);

  if (origin.hostname === '127.0.0.1') {
    origin.hostname = 'localhost';
    origins.add(origin.origin);
  } else if (origin.hostname === 'localhost') {
    origin.hostname = '127.0.0.1';
    origins.add(origin.origin);
  }

  return [...origins];
}

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService<AppEnvironment, true>);

  app.enableShutdownHooks();
  const trustProxyHops = config.getOrThrow('TRUST_PROXY_HOPS');
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }
  app.enableCors({
    origin: allowedFrontendOrigins(
      config.getOrThrow('FRONTEND_ORIGIN'),
      config.getOrThrow('NODE_ENV'),
    ),
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new ApiException(400, 'VALIDATION_ERROR', validationMessage(errors)),
    }),
  );
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
}

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  return app;
}
