import { Buffer } from 'node:buffer';

import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media.types.js';
import { publicAvatar } from '../profile/profile-avatar.js';
import { SafetyService } from '../safety/safety.service.js';
import { MessageRealtimeService } from './message-realtime.service.js';
import type {
  ConversationDetail,
  ConversationPage,
  ConversationSummary,
  DirectMessageData,
  MessagePage,
  MessageUnreadCount,
  ReadMessageResult,
  SendMessageResult,
} from './messages.types.js';

type ConversationCursor = {
  lastMessageAt: string;
  id: string;
  userId: string;
};

type MessageCursor = {
  createdAt: string;
  id: string;
  conversationId: string;
};

type ConversationRecord = {
  id: string;
  firstParticipantId: string;
  secondParticipantId: string;
  firstParticipantReadMessageId: string | null;
  firstParticipantReadAt: Date | null;
  secondParticipantReadMessageId: string | null;
  secondParticipantReadAt: Date | null;
};

type MessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class MessagesService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @Inject(MessageRealtimeService)
    private readonly realtime: MessageRealtimeService,
    @Optional() @Inject(SafetyService) private readonly safety?: SafetyService,
  ) {}

  async conversations(
    sessionId: string | undefined,
    cursorInput: string | undefined,
    limitInput: number,
  ): Promise<ConversationPage> {
    const user = await this.requireUser(sessionId);
    const limit = Number(limitInput);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw this.invalidPagination();
    }
    const cursor = this.decodeConversationCursor(cursorInput, user.id);
    const rows = await this.prisma.directConversation.findMany({
      where: {
        OR: [{ firstParticipantId: user.id }, { secondParticipantId: user.id }],
        ...(cursor
          ? {
              AND: [
                {
                  OR: [
                    { lastMessageAt: { lt: new Date(cursor.lastMessageAt) } },
                    {
                      lastMessageAt: new Date(cursor.lastMessageAt),
                      id: { lt: cursor.id },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        firstParticipantId: true,
        secondParticipantId: true,
        firstParticipantReadMessageId: true,
        firstParticipantReadAt: true,
        secondParticipantReadMessageId: true,
        secondParticipantReadAt: true,
        lastMessageAt: true,
        firstParticipant: {
          select: { id: true, nickname: true, avatarObjectKey: true },
        },
        secondParticipant: {
          select: { id: true, nickname: true, avatarObjectKey: true },
        },
        messages: {
          orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
          take: 1,
          select: this.messageSelect(),
        },
      },
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const opponentIds = pageRows.map((row) =>
      row.firstParticipantId === user.id
        ? row.secondParticipantId
        : row.firstParticipantId,
    );
    const [unreadCounts, mutualPairs] = await Promise.all([
      this.unreadCounts(
        user.id,
        pageRows.map((row) => row.id),
      ),
      this.mutualPairs(user.id, opponentIds),
    ]);
    const items: ConversationSummary[] = pageRows.flatMap((row) => {
      const lastMessage = row.messages[0];
      if (!lastMessage) return [];
      const opponent =
        row.firstParticipantId === user.id
          ? row.secondParticipant
          : row.firstParticipant;
      return [
        {
          id: row.id,
          opponent: {
            id: opponent.id,
            nickname: opponent.nickname,
            avatar: publicAvatar(
              opponent.nickname,
              opponent.avatarObjectKey,
              this.media,
            ),
          },
          lastMessage: this.toMessage(lastMessage, user.id, row),
          unreadCount: unreadCounts.get(row.id) ?? 0,
          canSend: mutualPairs.has(opponent.id),
        },
      ];
    });
    const last = pageRows.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? this.encode({
              lastMessageAt: last.lastMessageAt.toISOString(),
              id: last.id,
              userId: user.id,
            } satisfies ConversationCursor)
          : null,
    };
  }

  async conversation(
    sessionId: string | undefined,
    conversationId: string,
  ): Promise<ConversationDetail> {
    const user = await this.requireUser(sessionId);
    const conversation = await this.requireConversation(
      conversationId,
      user.id,
    );
    const opponent =
      conversation.firstParticipantId === user.id
        ? conversation.secondParticipant
        : conversation.firstParticipant;
    return {
      id: conversation.id,
      opponent: {
        id: opponent.id,
        nickname: opponent.nickname,
        avatar: publicAvatar(
          opponent.nickname,
          opponent.avatarObjectKey,
          this.media,
        ),
      },
      canSend: await this.isMutual(user.id, opponent.id),
    };
  }

  async messages(
    sessionId: string | undefined,
    conversationId: string,
    cursorInput: string | undefined,
    afterInput: string | undefined,
  ): Promise<MessagePage> {
    const user = await this.requireUser(sessionId);
    const conversation = await this.requireConversation(
      conversationId,
      user.id,
    );
    if (cursorInput && afterInput) throw this.invalidPagination();
    const cursor = this.decodeMessageCursor(
      cursorInput ?? afterInput,
      conversationId,
    );
    const newer = Boolean(afterInput);
    const where = cursor
      ? newer
        ? {
            OR: [
              { createdAt: { gt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } },
            ],
          }
        : {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
      : {};
    const rows = await this.prisma.directMessage.findMany({
      where: { conversationId, ...where },
      orderBy: newer
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 31,
      select: this.messageSelect(),
    });
    const hasMore = rows.length > 30;
    const selected = hasMore ? rows.slice(0, 30) : rows;
    const chronological = newer ? selected : [...selected].reverse();
    const oldest = chronological[0];
    const newest = chronological.at(-1);
    return {
      items: chronological.map((message) =>
        this.toMessage(message, user.id, conversation),
      ),
      nextCursor:
        !newer && hasMore && oldest
          ? this.messageCursor(oldest, conversationId)
          : null,
      syncCursor: newest
        ? this.messageCursor(newest, conversationId)
        : (afterInput ?? cursorInput ?? null),
      hasMoreAfter: newer && hasMore,
    };
  }

  async sendToUser(
    sessionId: string | undefined,
    targetUserId: string,
    contentInput: string,
    requestId: string,
  ): Promise<SendMessageResult> {
    const user = await this.requireUser(sessionId);
    if (!UUID_PATTERN.test(targetUserId)) throw this.userNotFound();
    return this.send(user.id, targetUserId, null, contentInput, requestId);
  }

  async sendToConversation(
    sessionId: string | undefined,
    conversationId: string,
    contentInput: string,
    requestId: string,
  ): Promise<SendMessageResult> {
    const user = await this.requireUser(sessionId);
    const conversation = await this.requireConversation(
      conversationId,
      user.id,
    );
    const targetUserId =
      conversation.firstParticipantId === user.id
        ? conversation.secondParticipantId
        : conversation.firstParticipantId;
    return this.send(
      user.id,
      targetUserId,
      conversation.id,
      contentInput,
      requestId,
    );
  }

  async markRead(
    sessionId: string | undefined,
    conversationId: string,
    messageId: string,
  ): Promise<ReadMessageResult> {
    const user = await this.requireUser(sessionId);
    if (!UUID_PATTERN.test(conversationId) || !UUID_PATTERN.test(messageId)) {
      throw this.conversationNotFound();
    }
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "direct_conversations"
        WHERE "id" = ${conversationId}::uuid
        FOR UPDATE
      `;
      const conversation = await transaction.directConversation.findFirst({
        where: {
          id: conversationId,
          OR: [
            { firstParticipantId: user.id },
            { secondParticipantId: user.id },
          ],
        },
        select: {
          id: true,
          firstParticipantId: true,
          secondParticipantId: true,
          firstParticipantReadMessageId: true,
          firstParticipantReadAt: true,
          secondParticipantReadMessageId: true,
          secondParticipantReadAt: true,
        },
      });
      if (!conversation) throw this.conversationNotFound();
      const message = await transaction.directMessage.findFirst({
        where: { id: messageId, conversationId, senderId: { not: user.id } },
        select: { id: true, createdAt: true },
      });
      if (!message) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'READ_BOUNDARY_INVALID',
          '已读位置无效',
        );
      }
      const first = conversation.firstParticipantId === user.id;
      const currentAt = first
        ? conversation.firstParticipantReadAt
        : conversation.secondParticipantReadAt;
      const currentId = first
        ? conversation.firstParticipantReadMessageId
        : conversation.secondParticipantReadMessageId;
      const advances =
        !currentAt ||
        message.createdAt > currentAt ||
        (message.createdAt.getTime() === currentAt.getTime() &&
          (!currentId || message.id > currentId));
      if (advances) {
        await transaction.directConversation.update({
          where: { id: conversationId },
          data: first
            ? {
                firstParticipantReadMessageId: message.id,
                firstParticipantReadAt: message.createdAt,
              }
            : {
                secondParticipantReadMessageId: message.id,
                secondParticipantReadAt: message.createdAt,
              },
        });
      }
      const unreadCount = await this.unreadForConversation(
        transaction,
        user.id,
        conversationId,
      );
      return {
        conversationId,
        messageId: advances ? message.id : (currentId ?? message.id),
        readAt: advances ? message.createdAt : (currentAt ?? message.createdAt),
        unreadCount,
        firstParticipantId: conversation.firstParticipantId,
        secondParticipantId: conversation.secondParticipantId,
      };
    });
    const total = await this.unreadCountForUser(user.id);
    const otherId =
      result.firstParticipantId === user.id
        ? result.secondParticipantId
        : result.firstParticipantId;
    const eventData = {
      conversationId,
      messageId: result.messageId,
      readAt: result.readAt.toISOString(),
      readerId: user.id,
    };
    this.realtime.publish(user.id, { type: 'read.updated', data: eventData });
    this.realtime.publish(otherId, { type: 'read.updated', data: eventData });
    this.realtime.publish(user.id, {
      type: 'unread.updated',
      data: { unreadCount: total.unreadCount },
    });
    return {
      conversationId,
      messageId: result.messageId,
      readAt: result.readAt.toISOString(),
      unreadCount: result.unreadCount,
    };
  }

  async unreadCount(
    sessionId: string | undefined,
  ): Promise<MessageUnreadCount> {
    const user = await this.requireUser(sessionId);
    return this.unreadCountForUser(user.id);
  }

  private async send(
    senderId: string,
    targetUserId: string,
    expectedConversationId: string | null,
    contentInput: string,
    requestId: string,
  ): Promise<SendMessageResult> {
    if (senderId === targetUserId) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'SELF_MESSAGE_NOT_ALLOWED',
        '不能给自己发私信',
      );
    }
    const content = this.validContent(contentInput);
    this.validRequestId(requestId);
    const [firstParticipantId, secondParticipantId] =
      senderId < targetUserId
        ? [senderId, targetUserId]
        : [targetUserId, senderId];

    const saved = await this.serializable(async (transaction) => {
      const duplicate = await transaction.directMessage.findUnique({
        where: {
          senderId_clientRequestId: { senderId, clientRequestId: requestId },
        },
        select: {
          ...this.messageSelect(),
          conversation: {
            select: {
              id: true,
              firstParticipantId: true,
              secondParticipantId: true,
              firstParticipantReadMessageId: true,
              firstParticipantReadAt: true,
              secondParticipantReadMessageId: true,
              secondParticipantReadAt: true,
            },
          },
        },
      });
      if (duplicate) {
        const expectedTarget =
          duplicate.conversation.firstParticipantId === senderId
            ? duplicate.conversation.secondParticipantId
            : duplicate.conversation.firstParticipantId;
        if (
          expectedTarget !== targetUserId ||
          (expectedConversationId &&
            duplicate.conversation.id !== expectedConversationId)
        ) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            'MESSAGE_REQUEST_ID_CONFLICT',
            '发送请求标识已被使用',
          );
        }
        return {
          created: false,
          message: duplicate,
          conversation: duplicate.conversation,
        };
      }

      await this.requireMutual(transaction, senderId, targetUserId);
      let conversation = await transaction.directConversation.findUnique({
        where: {
          firstParticipantId_secondParticipantId: {
            firstParticipantId,
            secondParticipantId,
          },
        },
        select: {
          id: true,
          firstParticipantId: true,
          secondParticipantId: true,
          firstParticipantReadMessageId: true,
          firstParticipantReadAt: true,
          secondParticipantReadMessageId: true,
          secondParticipantReadAt: true,
        },
      });
      if (
        expectedConversationId &&
        conversation?.id !== expectedConversationId
      ) {
        throw this.conversationNotFound();
      }
      const createdAt = new Date();
      conversation ??= await transaction.directConversation.create({
        data: {
          firstParticipantId,
          secondParticipantId,
          lastMessageAt: createdAt,
        },
        select: {
          id: true,
          firstParticipantId: true,
          secondParticipantId: true,
          firstParticipantReadMessageId: true,
          firstParticipantReadAt: true,
          secondParticipantReadMessageId: true,
          secondParticipantReadAt: true,
        },
      });
      const message = await transaction.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId,
          content,
          clientRequestId: requestId,
          createdAt,
        },
        select: this.messageSelect(),
      });
      await transaction.directConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: createdAt },
      });
      return { created: true, message, conversation };
    });

    if (saved.created) {
      const eventMessage = {
        id: saved.message.id,
        conversationId: saved.message.conversationId,
        senderId: saved.message.senderId,
        content: saved.message.content,
        createdAt: saved.message.createdAt.toISOString(),
      };
      for (const userId of [senderId, targetUserId]) {
        this.realtime.publish(userId, {
          type: 'message.created',
          data: { message: eventMessage },
        });
        this.realtime.publish(userId, {
          type: 'conversation.updated',
          data: {
            conversationId: saved.conversation.id,
            lastMessageAt: saved.message.createdAt.toISOString(),
          },
        });
      }
      const targetUnread = await this.unreadCountForUser(targetUserId);
      this.realtime.publish(targetUserId, {
        type: 'unread.updated',
        data: targetUnread,
      });
    }
    return {
      conversationId: saved.conversation.id,
      message: this.toMessage(saved.message, senderId, saved.conversation),
    };
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2002') &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('unreachable');
  }

  private async requireMutual(
    transaction: Prisma.TransactionClient,
    firstUserId: string,
    secondUserId: string,
  ): Promise<void> {
    if (typeof transaction.$queryRaw === 'function') {
      const [first, second] = [firstUserId, secondUserId].sort();
      await transaction.$queryRaw`
        SELECT id
        FROM "users"
        WHERE id IN (${first}::uuid, ${second}::uuid)
        ORDER BY id
        FOR UPDATE
      `;
    }
    const [sender, target] = await Promise.all([
      transaction.user.findUnique({
        where: { id: firstUserId },
        select: { id: true, status: true, ageRestrictedAt: true },
      }),
      transaction.user.findUnique({
        where: { id: secondUserId },
        select: { id: true, status: true, ageRestrictedAt: true },
      }),
    ]);
    if (
      !sender ||
      sender.status === 'SUSPENDED' ||
      sender.ageRestrictedAt ||
      !target ||
      target.status === 'SUSPENDED' ||
      target.ageRestrictedAt
    )
      throw this.userNotFound();
    const blocked = await transaction.userBlock?.count({
      where: {
        OR: [
          { blockerId: firstUserId, blockedId: secondUserId },
          { blockerId: secondUserId, blockedId: firstUserId },
        ],
      },
    });
    if ((blocked ?? 0) > 0) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'MESSAGE_BLOCKED',
        '当前无法发送私信',
      );
    }
    const count = await transaction.userFollow.count({
      where: {
        OR: [
          { followerId: firstUserId, followedId: secondUserId },
          { followerId: secondUserId, followedId: firstUserId },
        ],
      },
    });
    if (count !== 2) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'MUTUAL_FOLLOW_REQUIRED',
        '互相关注后可私信',
      );
    }
  }

  private async isMutual(firstUserId: string, secondUserId: string) {
    if (await this.safety?.isBlocked(firstUserId, secondUserId)) return false;
    const target = await this.prisma.user.findUnique({
      where: { id: secondUserId },
      select: { status: true, ageRestrictedAt: true },
    });
    if (!target || target.status === 'SUSPENDED' || target.ageRestrictedAt)
      return false;
    const count = await this.prisma.userFollow.count({
      where: {
        OR: [
          { followerId: firstUserId, followedId: secondUserId },
          { followerId: secondUserId, followedId: firstUserId },
        ],
      },
    });
    return count === 2;
  }

  private async mutualPairs(
    userId: string,
    opponentIds: string[],
  ): Promise<Set<string>> {
    if (opponentIds.length === 0) return new Set();
    const relations = await this.prisma.userFollow.findMany({
      where: {
        OR: [
          { followerId: userId, followedId: { in: opponentIds } },
          { followedId: userId, followerId: { in: opponentIds } },
        ],
      },
      select: { followerId: true, followedId: true },
    });
    const counts = new Map<string, number>();
    for (const relation of relations) {
      const opponent =
        relation.followerId === userId
          ? relation.followedId
          : relation.followerId;
      counts.set(opponent, (counts.get(opponent) ?? 0) + 1);
    }
    const mutual = new Set(
      [...counts.entries()]
        .filter(([, count]) => count === 2)
        .map(([opponent]) => opponent),
    );
    const [blocks, activeUsers] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: userId, blockedId: { in: [...mutual] } },
            { blockedId: userId, blockerId: { in: [...mutual] } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
      this.prisma.user.findMany({
        where: {
          id: { in: [...mutual] },
          status: 'ACTIVE',
          ageRestrictedAt: null,
        },
        select: { id: true },
      }),
    ]);
    const blockedIds = new Set(
      blocks.map((block) =>
        block.blockerId === userId ? block.blockedId : block.blockerId,
      ),
    );
    const activeIds = new Set(activeUsers.map((item) => item.id));
    return new Set(
      [...mutual].filter(
        (opponent) => !blockedIds.has(opponent) && activeIds.has(opponent),
      ),
    );
  }

  private async unreadCounts(
    userId: string,
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      Array<{ conversationId: string; unreadCount: bigint }>
    >(Prisma.sql`
      SELECT dm."conversationId", count(*) AS "unreadCount"
      FROM "direct_messages" dm
      JOIN "direct_conversations" dc ON dc."id" = dm."conversationId"
      WHERE dm."conversationId" IN (
        ${Prisma.join(conversationIds.map((id) => Prisma.sql`${id}::uuid`))}
      )
        AND dm."senderId" <> ${userId}::uuid
        AND (
          CASE WHEN dc."firstParticipantId" = ${userId}::uuid
            THEN dc."firstParticipantReadAt"
            ELSE dc."secondParticipantReadAt"
          END IS NULL
          OR dm."createdAt" > CASE WHEN dc."firstParticipantId" = ${userId}::uuid
            THEN dc."firstParticipantReadAt"
            ELSE dc."secondParticipantReadAt"
          END
          OR (
            dm."createdAt" = CASE WHEN dc."firstParticipantId" = ${userId}::uuid
              THEN dc."firstParticipantReadAt"
              ELSE dc."secondParticipantReadAt"
            END
            AND dm."id" > CASE WHEN dc."firstParticipantId" = ${userId}::uuid
              THEN dc."firstParticipantReadMessageId"
              ELSE dc."secondParticipantReadMessageId"
            END
          )
        )
      GROUP BY dm."conversationId"
    `);
    return new Map(
      rows.map((row) => [row.conversationId, Number(row.unreadCount)]),
    );
  }

  private async unreadForConversation(
    transaction: Prisma.TransactionClient,
    userId: string,
    conversationId: string,
  ): Promise<number> {
    const rows = await transaction.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS "count"
      FROM "direct_messages" dm
      JOIN "direct_conversations" dc ON dc."id" = dm."conversationId"
      WHERE dc."id" = ${conversationId}::uuid
        AND dm."senderId" <> ${userId}::uuid
        AND (
          CASE WHEN dc."firstParticipantId" = ${userId}::uuid
            THEN dc."firstParticipantReadAt"
            ELSE dc."secondParticipantReadAt"
          END IS NULL
          OR dm."createdAt" > CASE WHEN dc."firstParticipantId" = ${userId}::uuid
            THEN dc."firstParticipantReadAt"
            ELSE dc."secondParticipantReadAt"
          END
          OR (
            dm."createdAt" = CASE WHEN dc."firstParticipantId" = ${userId}::uuid
              THEN dc."firstParticipantReadAt"
              ELSE dc."secondParticipantReadAt"
            END
            AND dm."id" > CASE WHEN dc."firstParticipantId" = ${userId}::uuid
              THEN dc."firstParticipantReadMessageId"
              ELSE dc."secondParticipantReadMessageId"
            END
          )
        )
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private async unreadCountForUser(
    userId: string,
  ): Promise<MessageUnreadCount> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS "count"
      FROM "direct_messages" dm
      JOIN "direct_conversations" dc ON dc."id" = dm."conversationId"
      WHERE (${userId}::uuid IN (dc."firstParticipantId", dc."secondParticipantId"))
        AND dm."senderId" <> ${userId}::uuid
        AND (
          CASE WHEN dc."firstParticipantId" = ${userId}::uuid
            THEN dc."firstParticipantReadAt"
            ELSE dc."secondParticipantReadAt"
          END IS NULL
          OR dm."createdAt" > CASE WHEN dc."firstParticipantId" = ${userId}::uuid
            THEN dc."firstParticipantReadAt"
            ELSE dc."secondParticipantReadAt"
          END
          OR (
            dm."createdAt" = CASE WHEN dc."firstParticipantId" = ${userId}::uuid
              THEN dc."firstParticipantReadAt"
              ELSE dc."secondParticipantReadAt"
            END
            AND dm."id" > CASE WHEN dc."firstParticipantId" = ${userId}::uuid
              THEN dc."firstParticipantReadMessageId"
              ELSE dc."secondParticipantReadMessageId"
            END
          )
        )
    `;
    return { unreadCount: Number(rows[0]?.count ?? 0) };
  }

  private async requireConversation(conversationId: string, userId: string) {
    if (!UUID_PATTERN.test(conversationId)) throw this.conversationNotFound();
    const conversation = await this.prisma.directConversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ firstParticipantId: userId }, { secondParticipantId: userId }],
      },
      select: {
        id: true,
        firstParticipantId: true,
        secondParticipantId: true,
        firstParticipantReadMessageId: true,
        firstParticipantReadAt: true,
        secondParticipantReadMessageId: true,
        secondParticipantReadAt: true,
        firstParticipant: {
          select: { id: true, nickname: true, avatarObjectKey: true },
        },
        secondParticipant: {
          select: { id: true, nickname: true, avatarObjectKey: true },
        },
      },
    });
    if (!conversation) throw this.conversationNotFound();
    return conversation;
  }

  private messageSelect() {
    return {
      id: true,
      conversationId: true,
      senderId: true,
      content: true,
      createdAt: true,
    } as const;
  }

  private toMessage(
    message: MessageRecord,
    viewerId: string,
    conversation: ConversationRecord,
  ): DirectMessageData {
    const mine = message.senderId === viewerId;
    const opponentIsFirst = conversation.firstParticipantId !== viewerId;
    const readAt = opponentIsFirst
      ? conversation.firstParticipantReadAt
      : conversation.secondParticipantReadAt;
    const readId = opponentIsFirst
      ? conversation.firstParticipantReadMessageId
      : conversation.secondParticipantReadMessageId;
    const read =
      mine &&
      Boolean(readAt) &&
      (message.createdAt < readAt! ||
        (message.createdAt.getTime() === readAt!.getTime() &&
          Boolean(readId) &&
          message.id <= readId!));
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      mine,
      read,
    };
  }

  private validContent(input: string): string {
    const content = input.trim();
    const length = Array.from(content).length;
    if (length < 1 || length > 1000) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'MESSAGE_CONTENT_INVALID',
        '私信需为1～1000个字符',
      );
    }
    return content;
  }

  private validRequestId(requestId: string): void {
    if (requestId.trim().length < 1 || Array.from(requestId).length > 100) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'MESSAGE_REQUEST_ID_INVALID',
        '发送请求标识无效',
      );
    }
  }

  private async requireUser(sessionId: string | undefined) {
    const user = await this.auth.currentUser(sessionId);
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        '请先登录',
      );
    }
    return user;
  }

  private messageCursor(message: MessageRecord, conversationId: string) {
    return this.encode({
      createdAt: message.createdAt.toISOString(),
      id: message.id,
      conversationId,
    } satisfies MessageCursor);
  }

  private encode(value: object): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  }

  private decodeConversationCursor(
    input: string | undefined,
    userId: string,
  ): ConversationCursor | null {
    if (!input) return null;
    const parsed = this.decode(input) as Partial<ConversationCursor>;
    if (
      typeof parsed.lastMessageAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.lastMessageAt)) ||
      typeof parsed.id !== 'string' ||
      !UUID_PATTERN.test(parsed.id) ||
      parsed.userId !== userId
    ) {
      throw this.invalidCursor();
    }
    return parsed as ConversationCursor;
  }

  private decodeMessageCursor(
    input: string | undefined,
    conversationId: string,
  ): MessageCursor | null {
    if (!input) return null;
    const parsed = this.decode(input) as Partial<MessageCursor>;
    if (
      typeof parsed.createdAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== 'string' ||
      !UUID_PATTERN.test(parsed.id) ||
      parsed.conversationId !== conversationId
    ) {
      throw this.invalidCursor();
    }
    return parsed as MessageCursor;
  }

  private decode(input: string): unknown {
    try {
      if (input.length > 512) throw new Error('too long');
      return JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
    } catch {
      throw this.invalidCursor();
    }
  }

  private invalidCursor() {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'CURSOR_INVALID',
      '分页游标无效',
    );
  }

  private invalidPagination() {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'PAGINATION_INVALID',
      '分页参数无效',
    );
  }

  private conversationNotFound() {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'CONVERSATION_NOT_FOUND',
      '会话不存在',
    );
  }

  private userNotFound() {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'USER_NOT_FOUND',
      '用户不存在',
    );
  }
}
