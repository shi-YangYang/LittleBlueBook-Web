import { HttpException, type HttpStatus } from '@nestjs/common';

export type ApiErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
};

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    details?: unknown,
  ) {
    const body: ApiErrorBody = {
      statusCode: status,
      code,
      message,
      ...(details === undefined ? {} : { details }),
    };

    super(body, status);
  }
}
