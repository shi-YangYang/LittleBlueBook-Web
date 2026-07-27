import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import type { ApiErrorBody } from './api-exception.js';

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ApiErrorBody>;
  return (
    typeof candidate.statusCode === 'number' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (isApiErrorBody(body)) {
        response.status(status).json(body);
        return;
      }

      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        response.status(status).json({
          statusCode: status,
          code: 'IMAGE_TOO_LARGE',
          message: '单张图片不能超过10 MiB',
        } satisfies ApiErrorBody);
        return;
      }

      if (
        status === HttpStatus.BAD_REQUEST &&
        /(?:file|field|multipart)/i.test(exception.message)
      ) {
        response.status(status).json({
          statusCode: status,
          code: 'MULTIPART_INVALID',
          message: '图片数量或上传数据不符合要求',
        } satisfies ApiErrorBody);
        return;
      }

      response.status(status).json({
        statusCode: status,
        code: 'HTTP_ERROR',
        message:
          typeof body === 'string' ? body : exception.message || '请求处理失败',
      } satisfies ApiErrorBody);
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: '网络异常，请稍后重试',
    } satisfies ApiErrorBody);
  }
}
