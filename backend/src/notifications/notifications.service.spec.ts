import type { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from '../media/media.types.js';
import { NotificationsService } from './notifications.service.js';

const recipient = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'recipient@example.com',
  nickname: '接收者',
};
const actorId = '00000000-0000-4000-8000-000000000002';
const notificationId = '00000000-0000-4000-8000-000000000003';
const noteId = '00000000-0000-4000-8000-000000000004';

type StoredNotification = {
  id: string;
  type: 'NOTE_LIKED' | 'NOTE_FAVORITED' | 'NOTE_COMMENTED' | 'USER_FOLLOWED';
  createdAt: Date;
  readAt: Date | null;
  actor: {
    id: string;
    nickname: string;
    littleBlueBookId: string;
  } | null;
  note: {
    id: string;
    title: string;
    images: Array<{
      objectKey: string;
      width: number;
      height: number;
    }>;
  } | null;
  comment: { content: string } | null;
};

function dependencies() {
  const auth = {
    currentUser: jest.fn(
      async (): Promise<typeof recipient | null> => recipient,
    ),
  };
  const store = {
    notification: {
      findMany: jest.fn(async (): Promise<StoredNotification[]> => []),
      findFirst: jest.fn(
        async (): Promise<{ id: string; readAt: Date | null } | null> => ({
          id: notificationId,
          readAt: null,
        }),
      ),
      count: jest.fn(async () => 0),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const prisma = {
    ...store,
    $transaction: jest.fn(
      async (operation: (transaction: typeof store) => unknown) =>
        operation(store),
    ),
  };
  const media = {
    publicUrl: jest.fn((objectKey: string) => `/media/${objectKey}`),
  };
  return {
    service: new NotificationsService(
      auth as unknown as AuthService,
      prisma as unknown as PrismaService,
      media as unknown as MediaStorage,
    ),
    auth,
    prisma,
  };
}

describe('NotificationsService', () => {
  it('lists only the current recipient tab with stable ordering and a scoped cursor', async () => {
    const { service, prisma } = dependencies();
    const createdAt = new Date('2026-07-29T12:00:00.000Z');
    prisma.notification.findMany.mockResolvedValue([
      {
        id: notificationId,
        type: 'NOTE_COMMENTED',
        createdAt,
        readAt: null,
        actor: {
          id: actorId,
          nickname: '<b>评论者</b>',
          littleBlueBookId: '1234567890',
        },
        note: {
          id: noteId,
          title: '通知笔记',
          images: [
            {
              objectKey: 'cover.png',
              width: 120,
              height: 160,
            },
          ],
        },
        comment: { content: '<script>纯文本评论</script>' },
      },
      {
        id: '00000000-0000-4000-8000-000000000005',
        type: 'NOTE_COMMENTED',
        createdAt: new Date('2026-07-29T11:00:00.000Z'),
        readAt: createdAt,
        actor: null,
        note: null,
        comment: null,
      },
    ]);

    const page = await service.list('session', 'comments', undefined, 1);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipientId: recipient.id,
          type: { in: ['NOTE_COMMENTED'] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: notificationId,
      action: '评论了你的笔记',
      readAt: null,
      actor: {
        nickname: '<b>评论者</b>',
        littleBlueBookId: '1234567890',
      },
      note: {
        id: noteId,
        thumbnail: { url: '/media/cover.png' },
      },
      comment: {
        preview: '<script>纯文本评论</script>',
        deleted: false,
      },
    });
    expect(page.nextCursor).toEqual(expect.any(String));

    await expect(
      service.list('session', 'follows', page.nextCursor!, 20),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CURSOR_INVALID' }),
    });
  });

  it('rejects anonymous access', async () => {
    const { service, auth, prisma } = dependencies();
    auth.currentUser.mockResolvedValue(null);

    await expect(
      service.list(undefined, 'all', undefined, 20),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AUTHENTICATION_REQUIRED',
      }),
    });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('marks only an owned notification read idempotently', async () => {
    const { service, prisma } = dependencies();

    const first = await service.read('session', notificationId);
    expect(first).toMatchObject({ id: notificationId, unreadCount: 0 });
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: notificationId, recipientId: recipient.id },
      select: { id: true, readAt: true },
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: notificationId,
          recipientId: recipient.id,
          readAt: null,
        },
      }),
    );

    prisma.notification.updateMany.mockClear();
    prisma.notification.findFirst.mockResolvedValue({
      id: notificationId,
      readAt: new Date(first.readAt),
    });
    await expect(service.read('session', notificationId)).resolves.toEqual(
      first,
    );
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('returns a safe not-found response for an unowned notification', async () => {
    const { service, prisma } = dependencies();
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(
      service.read('session', notificationId),
    ).rejects.toBeInstanceOf(ApiException);
    await expect(service.read('session', notificationId)).rejects.toMatchObject(
      {
        response: expect.objectContaining({ code: 'NOTIFICATION_NOT_FOUND' }),
      },
    );
  });

  it('marks all current-recipient categories and unloaded pages read', async () => {
    const { service, prisma } = dependencies();
    prisma.notification.updateMany.mockResolvedValue({ count: 37 });

    await expect(service.readAll('session')).resolves.toEqual({
      updatedCount: 37,
      unreadCount: 0,
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: recipient.id, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
