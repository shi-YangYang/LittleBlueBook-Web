import { Buffer } from 'node:buffer';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media.types.js';
import { publicAvatar } from '../profile/profile-avatar.js';
import type {
  AdminListReportsDto,
  CreateReportDto,
  ModerationActionDto,
} from './dto/safety.dto.js';
import type {
  AdminReportPage,
  BlockedUserPage,
  ReportItem,
  ReportPage,
  ReportStatusValue,
  ReportTargetTypeValue,
} from './safety.types.js';

type Cursor = { createdAt: string; id: string; scope: string };
type Database = PrismaService | Prisma.TransactionClient;

const RESULT_LABELS: Record<ReportStatusValue, ReportItem['result']> = {
  PENDING: '处理中',
  ACTIONED: '已采取措施',
  DISMISSED: '未发现违规',
  TARGET_UNAVAILABLE: '目标已失效',
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SafetyService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
  ) {}

  async createReport(
    sessionId: string | undefined,
    input: CreateReportDto,
  ): Promise<ReportItem> {
    const reporter = await this.requireUser(sessionId);
    const details = input.details?.trim() || null;
    if (details && Array.from(details).length > 200) {
      throw this.invalid(
        'REPORT_DETAILS_INVALID',
        '举报补充说明不能超过200个字符',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.lockReportContext(
        transaction,
        reporter.id,
        input.targetType,
        input.targetId,
      );
      await this.assertReportTarget(
        transaction,
        reporter.id,
        input.targetType,
        input.targetId,
      );
      const existing = await transaction.report.findFirst({
        where: {
          reporterId: reporter.id,
          targetType: input.targetType,
          targetId: input.targetId,
          status: 'PENDING',
        },
      });
      if (existing) return this.reportItem(existing);

      const recent = await transaction.report.count({
        where: {
          reporterId: reporter.id,
          createdAt: { gt: new Date(Date.now() - 60 * 60_000) },
        },
      });
      if (recent >= 10) {
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          'REPORT_RATE_LIMITED',
          '举报提交过于频繁，请稍后再试',
        );
      }
      const report = await transaction.report.create({
        data: {
          reporterId: reporter.id,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          details,
        },
      });
      return this.reportItem(report);
    });
  }

  async reports(
    sessionId: string | undefined,
    cursorInput?: string,
  ): Promise<ReportPage> {
    const user = await this.requireUser(sessionId);
    const scope = `mine:${user.id}`;
    const cursor = this.decodeCursor(cursorInput, scope);
    const rows = await this.prisma.report.findMany({
      where: {
        reporterId: user.id,
        ...(cursor ? this.cursorWhere(cursor) : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
    });
    const hasMore = rows.length > 20;
    const page = hasMore ? rows.slice(0, 20) : rows;
    return {
      items: page.map((row) => this.reportItem(row)),
      nextCursor: hasMore ? this.nextCursor(page.at(-1), scope) : null,
    };
  }

  async block(
    sessionId: string | undefined,
    blockedId: string,
  ): Promise<{ blocked: true }> {
    const user = await this.requireUser(sessionId);
    if (!UUID_PATTERN.test(blockedId) || user.id === blockedId)
      throw this.userNotFound();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM "users"
        WHERE id IN (${user.id}::uuid, ${blockedId}::uuid)
        ORDER BY id
        FOR UPDATE
      `;
      const target = await transaction.user.findFirst({
        where: { id: blockedId, role: 'USER', status: 'ACTIVE' },
        select: { id: true },
      });
      if (!target) throw this.userNotFound();
      await transaction.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: user.id, blockedId } },
        create: { blockerId: user.id, blockedId },
        update: {},
      });
      await transaction.userFollow.deleteMany({
        where: {
          OR: [
            { followerId: user.id, followedId: blockedId },
            { followerId: blockedId, followedId: user.id },
          ],
        },
      });
      await transaction.notification.updateMany({
        where: {
          suppressedAt: null,
          OR: [
            { recipientId: user.id, actorId: blockedId },
            { recipientId: blockedId, actorId: user.id },
          ],
        },
        data: { suppressedAt: new Date() },
      });
    });
    return { blocked: true };
  }

  async unblock(
    sessionId: string | undefined,
    blockedId: string,
  ): Promise<{ blocked: false }> {
    const user = await this.requireUser(sessionId);
    if (!UUID_PATTERN.test(blockedId)) throw this.userNotFound();
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: user.id, blockedId },
    });
    return { blocked: false };
  }

  async blockedUsers(
    sessionId: string | undefined,
    cursorInput?: string,
  ): Promise<BlockedUserPage> {
    const user = await this.requireUser(sessionId);
    const scope = `blocks:${user.id}`;
    const cursor = this.decodeCursor(cursorInput, scope);
    const rows = await this.prisma.userBlock.findMany({
      where: {
        blockerId: user.id,
        ...(cursor ? this.cursorWhere(cursor, 'blockedId') : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { blockedId: 'desc' }],
      take: 21,
      select: {
        blockedId: true,
        createdAt: true,
        blocked: {
          select: {
            nickname: true,
            littleBlueBookId: true,
            avatarObjectKey: true,
          },
        },
      },
    });
    const hasMore = rows.length > 20;
    const page = hasMore ? rows.slice(0, 20) : rows;
    return {
      items: page.map((row) => ({
        id: row.blockedId,
        nickname: row.blocked.nickname,
        littleBlueBookId: row.blocked.littleBlueBookId,
        avatar: publicAvatar(
          row.blocked.nickname,
          row.blocked.avatarObjectKey,
          this.media,
        ),
        blockedAt: row.createdAt.toISOString(),
      })),
      nextCursor: hasMore
        ? this.nextCursor(
            page.at(-1)
              ? {
                  createdAt: page.at(-1)!.createdAt,
                  id: page.at(-1)!.blockedId,
                }
              : undefined,
            scope,
          )
        : null,
    };
  }

  async isBlocked(firstUserId: string, secondUserId: string): Promise<boolean> {
    if (firstUserId === secondUserId) return false;
    return (
      (await this.prisma.userBlock.count({
        where: {
          OR: [
            { blockerId: firstUserId, blockedId: secondUserId },
            { blockerId: secondUserId, blockedId: firstUserId },
          ],
        },
      })) > 0
    );
  }

  async assertNotBlocked(
    firstUserId: string,
    secondUserId: string,
  ): Promise<void> {
    if (await this.isBlocked(firstUserId, secondUserId)) {
      throw this.userNotFound();
    }
  }

  async blockedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [
      ...new Set(
        rows.map((row) =>
          row.blockerId === userId ? row.blockedId : row.blockerId,
        ),
      ),
    ];
  }

  async adminReports(
    sessionId: string | undefined,
    input: AdminListReportsDto,
  ): Promise<AdminReportPage> {
    await this.requireAdmin(sessionId);
    const scope = `admin:${input.status ?? '*'}:${input.targetType ?? '*'}`;
    const cursor = this.decodeCursor(input.cursor, scope);
    const rows = await this.prisma.report.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.targetType ? { targetType: input.targetType } : {}),
        ...(cursor ? this.cursorWhere(cursor) : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      include: {
        reporter: {
          select: {
            id: true,
            nickname: true,
            littleBlueBookId: true,
            avatarObjectKey: true,
          },
        },
      },
    });
    const hasMore = rows.length > 20;
    const page = hasMore ? rows.slice(0, 20) : rows;
    const targets = await this.targetSummaries(page);
    return {
      items: page.map((row) => ({
        ...this.reportItem(row),
        reporter: {
          id: row.reporter.id,
          nickname: row.reporter.nickname,
          littleBlueBookId: row.reporter.littleBlueBookId,
          avatar: publicAvatar(
            row.reporter.nickname,
            row.reporter.avatarObjectKey,
            this.media,
          ),
        },
        target: targets.get(`${row.targetType}:${row.targetId}`) ?? {
          available: false,
          label: null,
          state: 'TARGET_UNAVAILABLE',
        },
      })),
      nextCursor: hasMore ? this.nextCursor(page.at(-1), scope) : null,
    };
  }

  async dismiss(
    sessionId: string | undefined,
    reportId: string,
    rawReason: string,
  ): Promise<{ status: 'DISMISSED' }> {
    const admin = await this.requireAdmin(sessionId);
    if (!UUID_PATTERN.test(reportId))
      throw this.notFound('REPORT_NOT_FOUND', '举报不存在');
    const reason = this.moderationReason(rawReason);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM "reports"
        WHERE id = ${reportId}::uuid
        FOR UPDATE
      `;
      const report = await transaction.report.findUnique({
        where: { id: reportId },
      });
      if (!report) throw this.notFound('REPORT_NOT_FOUND', '举报不存在');
      if (report.status === 'DISMISSED')
        return { status: 'DISMISSED' } as const;
      if (report.status !== 'PENDING') throw this.conflict();
      await transaction.report.update({
        where: { id: report.id },
        data: { status: 'DISMISSED' },
      });
      await transaction.moderationAudit.create({
        data: {
          administratorId: admin.id,
          action: 'DISMISS_REPORT',
          targetType: report.targetType,
          targetId: report.targetId,
          reason,
          previousState: 'PENDING',
          nextState: 'DISMISSED',
        },
      });
      return { status: 'DISMISSED' } as const;
    });
  }

  async moderate(
    sessionId: string | undefined,
    input: ModerationActionDto,
  ): Promise<{ changed: boolean; state: string }> {
    const admin = await this.requireAdmin(sessionId);
    const reason = this.moderationReason(input.reason);
    return this.prisma.$transaction(async (transaction) => {
      await this.lockModerationTarget(
        transaction,
        input.targetType,
        input.targetId,
      );
      const changed = await this.applyModeration(transaction, admin.id, input);
      if (!changed.changed) return changed;
      await transaction.report.updateMany({
        where: {
          targetType: input.targetType,
          targetId: input.targetId,
          status: 'PENDING',
        },
        data: { status: 'ACTIONED' },
      });
      await transaction.moderationAudit.create({
        data: {
          administratorId: admin.id,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          reason,
          previousState: changed.previousState,
          nextState: changed.state,
        },
      });
      return { changed: true, state: changed.state };
    });
  }

  async markTargetUnavailable(
    database: Database,
    targetType: 'NOTE' | 'COMMENT',
    targetId: string | string[],
  ): Promise<void> {
    const ids = Array.isArray(targetId) ? targetId : [targetId];
    if (ids.length === 0) return;
    await database.report.updateMany({
      where: { targetType, targetId: { in: ids }, status: 'PENDING' },
      data: { status: 'TARGET_UNAVAILABLE' },
    });
  }

  private async applyModeration(
    transaction: Prisma.TransactionClient,
    adminId: string,
    input: ModerationActionDto,
  ): Promise<{ changed: boolean; previousState: string; state: string }> {
    if (input.action === 'HIDE_NOTE' || input.action === 'RESTORE_NOTE') {
      if (input.targetType !== 'NOTE') throw this.conflict();
      const note = await transaction.note.findUnique({
        where: { id: input.targetId },
      });
      if (!note) throw this.notFound('NOTE_NOT_FOUND', '笔记不存在');
      const state = input.action === 'HIDE_NOTE' ? 'HIDDEN' : 'VISIBLE';
      if (note.moderationStatus === state)
        return { changed: false, previousState: state, state };
      await transaction.note.update({
        where: { id: note.id },
        data: { moderationStatus: state },
      });
      return { changed: true, previousState: note.moderationStatus, state };
    }
    if (input.action === 'HIDE_COMMENT' || input.action === 'RESTORE_COMMENT') {
      if (input.targetType !== 'COMMENT') throw this.conflict();
      const comment = await transaction.noteComment.findUnique({
        where: { id: input.targetId },
      });
      if (!comment || comment.deletedAt)
        throw this.notFound('COMMENT_NOT_FOUND', '评论不存在');
      const state = input.action === 'HIDE_COMMENT' ? 'HIDDEN' : 'VISIBLE';
      if (comment.moderationStatus === state)
        return { changed: false, previousState: state, state };
      await transaction.noteComment.update({
        where: { id: comment.id },
        data: { moderationStatus: state },
      });
      return { changed: true, previousState: comment.moderationStatus, state };
    }
    if (input.action === 'SUSPEND_USER' || input.action === 'RESTORE_USER') {
      if (input.targetType !== 'USER') throw this.conflict();
      const user = await transaction.user.findUnique({
        where: { id: input.targetId },
      });
      if (!user || user.role !== 'USER' || user.id === adminId)
        throw this.userNotFound();
      const state = input.action === 'SUSPEND_USER' ? 'SUSPENDED' : 'ACTIVE';
      if (user.status === state)
        return { changed: false, previousState: state, state };
      await transaction.user.update({
        where: { id: user.id },
        data: { status: state, authVersion: { increment: 1 } },
      });
      return { changed: true, previousState: user.status, state };
    }
    throw this.conflict();
  }

  private async lockModerationTarget(
    transaction: Prisma.TransactionClient,
    targetType: ReportTargetTypeValue,
    targetId: string,
  ): Promise<void> {
    if (targetType === 'NOTE') {
      await transaction.$queryRaw`
        SELECT id FROM "notes"
        WHERE id = ${targetId}::uuid
        FOR UPDATE
      `;
      return;
    }
    if (targetType === 'COMMENT') {
      await transaction.$queryRaw`
        SELECT id FROM "note_comments"
        WHERE id = ${targetId}::uuid
        FOR UPDATE
      `;
      return;
    }
    await transaction.$queryRaw`
      SELECT id FROM "users"
      WHERE id = ${targetId}::uuid
      FOR UPDATE
    `;
  }

  private async assertReportTarget(
    database: Database,
    reporterId: string,
    type: ReportTargetTypeValue,
    targetId: string,
  ): Promise<void> {
    if (type === 'USER') {
      const target = await database.user.findFirst({
        where: { id: targetId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!target || target.id === reporterId) throw this.userNotFound();
      await this.assertDatabaseNotBlocked(database, reporterId, target.id);
      return;
    }
    if (type === 'NOTE') {
      const target = await database.note.findFirst({
        where: {
          id: targetId,
          moderationStatus: 'VISIBLE',
          author: { status: 'ACTIVE' },
        },
        select: { authorId: true },
      });
      if (!target || target.authorId === reporterId)
        throw this.notFound('NOTE_NOT_FOUND', '笔记不存在');
      await this.assertDatabaseNotBlocked(
        database,
        reporterId,
        target.authorId,
      );
      return;
    }
    const target = await database.noteComment.findFirst({
      where: {
        id: targetId,
        deletedAt: null,
        moderationStatus: 'VISIBLE',
        author: { status: 'ACTIVE' },
        note: { moderationStatus: 'VISIBLE', author: { status: 'ACTIVE' } },
      },
      select: { authorId: true },
    });
    if (!target || target.authorId === reporterId)
      throw this.notFound('COMMENT_NOT_FOUND', '评论不存在');
    await this.assertDatabaseNotBlocked(database, reporterId, target.authorId);
  }

  private async lockReportContext(
    transaction: Prisma.TransactionClient,
    reporterId: string,
    targetType: ReportTargetTypeValue,
    targetId: string,
  ): Promise<void> {
    if (!UUID_PATTERN.test(targetId)) {
      throw this.notFound('REPORT_TARGET_NOT_FOUND', '举报目标不存在');
    }
    if (targetType === 'USER') {
      const [firstId, secondId] = [reporterId, targetId].sort();
      await transaction.$queryRaw`
        SELECT id
        FROM "users"
        WHERE id IN (${firstId}::uuid, ${secondId}::uuid)
        ORDER BY id
        FOR UPDATE
      `;
      return;
    }

    await transaction.$queryRaw`
      SELECT id FROM "users"
      WHERE id = ${reporterId}::uuid
      FOR UPDATE
    `;
    if (targetType === 'NOTE') {
      await transaction.$queryRaw`
        SELECT id FROM "notes"
        WHERE id = ${targetId}::uuid
        FOR UPDATE
      `;
      return;
    }

    const comments = await transaction.$queryRaw<Array<{ noteId: string }>>`
      SELECT "noteId" FROM "note_comments"
      WHERE id = ${targetId}::uuid
    `;
    const noteId = comments[0]?.noteId;
    if (noteId) {
      await transaction.$queryRaw`
        SELECT id FROM "notes"
        WHERE id = ${noteId}::uuid
        FOR UPDATE
      `;
    }
    await transaction.$queryRaw`
      SELECT id FROM "note_comments"
      WHERE id = ${targetId}::uuid
      FOR UPDATE
    `;
  }

  private async assertDatabaseNotBlocked(
    database: Database,
    firstUserId: string,
    secondUserId: string,
  ): Promise<void> {
    if (firstUserId === secondUserId) return;
    const blocked = await database.userBlock.count({
      where: {
        OR: [
          { blockerId: firstUserId, blockedId: secondUserId },
          { blockerId: secondUserId, blockedId: firstUserId },
        ],
      },
    });
    if (blocked > 0) throw this.userNotFound();
  }

  private async targetSummaries(
    reports: Array<{ targetType: ReportTargetTypeValue; targetId: string }>,
  ) {
    const map = new Map<
      string,
      { available: boolean; label: string | null; state: string }
    >();
    const noteIds = reports
      .filter((r) => r.targetType === 'NOTE')
      .map((r) => r.targetId);
    const commentIds = reports
      .filter((r) => r.targetType === 'COMMENT')
      .map((r) => r.targetId);
    const userIds = reports
      .filter((r) => r.targetType === 'USER')
      .map((r) => r.targetId);
    const [notes, comments, users] = await Promise.all([
      this.prisma.note.findMany({
        where: { id: { in: noteIds } },
        select: { id: true, title: true, moderationStatus: true },
      }),
      this.prisma.noteComment.findMany({
        where: { id: { in: commentIds } },
        select: {
          id: true,
          content: true,
          deletedAt: true,
          moderationStatus: true,
        },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nickname: true, status: true },
      }),
    ]);
    for (const note of notes)
      map.set(`NOTE:${note.id}`, {
        available: true,
        label: note.title,
        state: note.moderationStatus,
      });
    for (const comment of comments)
      map.set(`COMMENT:${comment.id}`, {
        available: !comment.deletedAt,
        label: comment.deletedAt ? null : comment.content,
        state: comment.deletedAt
          ? 'TARGET_UNAVAILABLE'
          : comment.moderationStatus,
      });
    for (const user of users)
      map.set(`USER:${user.id}`, {
        available: true,
        label: user.nickname,
        state: user.status,
      });
    return map;
  }

  private async requireUser(sessionId: string | undefined) {
    const user = await this.auth.currentUser(sessionId);
    if (!user)
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        '请先登录',
      );
    return user;
  }

  private async requireAdmin(sessionId: string | undefined) {
    const user = await this.auth.currentUser(sessionId);
    if (!user || user.role !== 'ADMIN')
      throw this.notFound('PAGE_NOT_FOUND', '页面不存在');
    return user;
  }

  private reportItem(report: {
    id: string;
    targetType: ReportTargetTypeValue;
    targetId: string;
    reason: string;
    details: string | null;
    status: ReportStatusValue;
    createdAt: Date;
  }): ReportItem {
    return {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      details: report.details,
      status: report.status,
      result: RESULT_LABELS[report.status],
      createdAt: report.createdAt.toISOString(),
    };
  }

  private cursorWhere(cursor: Cursor, idField: 'id' | 'blockedId' = 'id') {
    return {
      OR: [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), [idField]: { lt: cursor.id } },
      ],
    };
  }

  private nextCursor(
    row: { createdAt: Date; id?: string; targetId?: string } | undefined,
    scope: string,
  ) {
    if (!row) return null;
    return Buffer.from(
      JSON.stringify({
        createdAt: row.createdAt.toISOString(),
        id: row.id ?? row.targetId,
        scope,
      }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(
    input: string | undefined,
    scope: string,
  ): Cursor | null {
    if (!input) return null;
    try {
      const parsed = JSON.parse(
        Buffer.from(input, 'base64url').toString('utf8'),
      ) as Cursor;
      if (
        parsed.scope !== scope ||
        !parsed.id ||
        Number.isNaN(Date.parse(parsed.createdAt))
      )
        throw new Error();
      return parsed;
    } catch {
      throw this.invalid('CURSOR_INVALID', '分页游标无效');
    }
  }

  private moderationReason(input: string): string {
    const reason = input.trim();
    if (!reason || Array.from(reason).length > 500)
      throw this.invalid(
        'MODERATION_REASON_INVALID',
        '处置理由需为1～500个字符',
      );
    return reason;
  }

  private invalid(code: string, message: string) {
    return new ApiException(HttpStatus.BAD_REQUEST, code, message);
  }

  private notFound(code: string, message: string) {
    return new ApiException(HttpStatus.NOT_FOUND, code, message);
  }

  private userNotFound() {
    return this.notFound('USER_NOT_FOUND', '用户不存在');
  }

  private conflict() {
    return new ApiException(
      HttpStatus.CONFLICT,
      'MODERATION_STATE_CONFLICT',
      '当前状态无法执行该操作',
    );
  }
}
