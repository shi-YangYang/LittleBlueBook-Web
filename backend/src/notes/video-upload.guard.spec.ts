import type { ExecutionContext } from '@nestjs/common';

import type { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import type { VideoUploadReservationService } from './video-upload-reservation.service.js';
import {
  MAX_VIDEO_MULTIPART_BYTES,
  VIDEO_UPLOAD_RESERVATION,
  VideoUploadGuard,
  type VideoUploadRequest,
} from './video-upload.guard.js';

function contextFor(request: VideoUploadRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('VideoUploadGuard', () => {
  const user = { id: 'user-1' };

  it('rejects unsupported media types before authentication or reservation', async () => {
    const auth = { requireWriteUser: jest.fn() };
    const reservations = { reserve: jest.fn() };
    const guard = new VideoUploadGuard(
      auth as unknown as AuthService,
      reservations as unknown as VideoUploadReservationService,
    );

    await expect(
      guard.canActivate(
        contextFor({ headers: {} } as unknown as VideoUploadRequest),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_MULTIPART_REQUIRED' }),
    });
    expect(auth.requireWriteUser).not.toHaveBeenCalled();
    expect(reservations.reserve).not.toHaveBeenCalled();
  });

  it('rejects a declared oversized body before authentication or reservation', async () => {
    const auth = { requireWriteUser: jest.fn() };
    const reservations = { reserve: jest.fn() };
    const guard = new VideoUploadGuard(
      auth as unknown as AuthService,
      reservations as unknown as VideoUploadReservationService,
    );
    const request = {
      headers: {
        'content-type': 'multipart/form-data; boundary=bounded',
        'content-length': String(MAX_VIDEO_MULTIPART_BYTES + 1),
      },
    } as unknown as VideoUploadRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_UPLOAD_TOO_LARGE' }),
    });
    expect(auth.requireWriteUser).not.toHaveBeenCalled();
    expect(reservations.reserve).not.toHaveBeenCalled();
  });

  it('does not reserve an upload when the write-user gate rejects the session', async () => {
    const auth = {
      requireWriteUser: jest
        .fn()
        .mockRejectedValue(new ApiException(401, 'AUTH_REQUIRED', '请先登录')),
    };
    const reservations = { reserve: jest.fn() };
    const guard = new VideoUploadGuard(
      auth as unknown as AuthService,
      reservations as unknown as VideoUploadReservationService,
    );
    const request = {
      headers: {
        'content-type': 'multipart/form-data; boundary=bounded',
        'content-length': '1024',
      },
    } as unknown as VideoUploadRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_REQUIRED' }),
    });
    expect(reservations.reserve).not.toHaveBeenCalled();
  });

  it('reserves only after the write-user gate and attaches the reservation', async () => {
    const order: string[] = [];
    const auth = {
      requireWriteUser: jest.fn(async () => {
        order.push('auth');
        return user;
      }),
    };
    const reservation = { userId: user.id, token: 'upload-token' };
    const reservations = {
      reserve: jest.fn(async () => {
        order.push('reserve');
        return reservation;
      }),
    };
    const guard = new VideoUploadGuard(
      auth as unknown as AuthService,
      reservations as unknown as VideoUploadReservationService,
    );
    const request = {
      headers: {
        'content-type': 'multipart/form-data; boundary=bounded',
        'content-length': '1024',
      },
    } as unknown as VideoUploadRequest;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(order).toEqual(['auth', 'reserve']);
    expect(request[VIDEO_UPLOAD_RESERVATION]).toEqual(reservation);
  });
});
