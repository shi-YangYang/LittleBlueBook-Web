import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from '../media/media.types.js';
import type { MessageRealtimeService } from './message-realtime.service.js';
import { MessagesService } from './messages.service.js';

const senderId = '00000000-0000-4000-8000-000000000301';
const targetId = '00000000-0000-4000-8000-000000000302';
const conversationId = '00000000-0000-4000-8000-000000000303';
const messageId = '00000000-0000-4000-8000-000000000304';

function conversation() {
  return {
    id: conversationId,
    firstParticipantId: senderId,
    secondParticipantId: targetId,
    firstParticipantReadMessageId: null,
    firstParticipantReadAt: null,
    secondParticipantReadMessageId: null,
    secondParticipantReadAt: null,
  };
}

function message() {
  return {
    id: messageId,
    conversationId,
    senderId,
    content: '你好 👋',
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
  };
}

function dependencies(transaction: Record<string, unknown>) {
  const auth = {
    currentUser: jest.fn(async () => ({
      id: senderId,
      email: 'private@example.test',
      nickname: '发送者',
      avatar: { type: 'initial', value: '发' },
    })),
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (tx: unknown) => unknown) =>
      operation(transaction),
    ),
    $queryRaw: jest.fn(async () => [{ count: BigInt(1) }]),
  };
  const realtime = { publish: jest.fn() };
  const media = { publicUrl: jest.fn() };
  const service = new MessagesService(
    auth as unknown as AuthService,
    prisma as unknown as PrismaService,
    media as unknown as MediaStorage,
    realtime as unknown as MessageRealtimeService,
  );
  return { service, prisma, realtime };
}

describe('MessagesService', () => {
  it('creates the first conversation and message in one serializable transaction', async () => {
    const transaction = {
      directMessage: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => message()),
      },
      user: { findUnique: jest.fn(async () => ({ id: targetId })) },
      userFollow: { count: jest.fn(async () => 2) },
      directConversation: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => conversation()),
        update: jest.fn(async () => undefined),
      },
    };
    const { service, realtime } = dependencies(transaction);

    const result = await service.sendToUser(
      'session',
      targetId,
      '  你好 👋  ',
      'opaque-request-1',
    );

    expect(result).toMatchObject({
      conversationId,
      message: { id: messageId, content: '你好 👋', mine: true },
    });
    expect(transaction.directConversation.create).toHaveBeenCalledTimes(1);
    expect(transaction.directMessage.create).toHaveBeenCalledTimes(1);
    expect(realtime.publish).toHaveBeenCalledWith(
      targetId,
      expect.objectContaining({ type: 'message.created' }),
    );
  });

  it('returns the prior message for the same sender request id without rechecking follow state', async () => {
    const transaction = {
      directMessage: {
        findUnique: jest.fn(async () => ({
          ...message(),
          conversation: conversation(),
        })),
      },
      user: { findUnique: jest.fn() },
      userFollow: { count: jest.fn() },
      directConversation: { create: jest.fn() },
    };
    const { service, realtime } = dependencies(transaction);
    const result = await service.sendToUser(
      'session',
      targetId,
      '你好 👋',
      'opaque-request-1',
    );

    expect(result.message.id).toBe(messageId);
    expect(transaction.userFollow.count).not.toHaveBeenCalled();
    expect(transaction.directConversation.create).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });
});
