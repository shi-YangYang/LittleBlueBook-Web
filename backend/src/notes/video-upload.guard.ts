import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { AuthService } from '../auth/auth.service.js';
import { readCookie } from '../auth/cookies.js';
import { ApiException } from '../common/api-exception.js';
import {
  VideoUploadReservationService,
  type VideoUploadReservation,
} from './video-upload-reservation.service.js';

export const VIDEO_UPLOAD_RESERVATION = Symbol('VIDEO_UPLOAD_RESERVATION');
export const MAX_VIDEO_MULTIPART_BYTES = 111 * 1024 * 1024;

export type VideoUploadRequest = Request & {
  [VIDEO_UPLOAD_RESERVATION]?: VideoUploadReservation;
};

@Injectable()
export class VideoUploadGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(VideoUploadReservationService)
    private readonly reservations: VideoUploadReservationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<VideoUploadRequest>();
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
      throw new ApiException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'VIDEO_MULTIPART_REQUIRED',
        '视频发布请求必须使用multipart/form-data',
      );
    }
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_VIDEO_MULTIPART_BYTES
    ) {
      throw new ApiException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'VIDEO_UPLOAD_TOO_LARGE',
        '视频或封面文件超过大小限制',
      );
    }
    const user = await this.auth.requireWriteUser(
      readCookie(request, SESSION_COOKIE_NAME),
    );
    request[VIDEO_UPLOAD_RESERVATION] = await this.reservations.reserve(
      user.id,
    );
    return true;
  }
}
