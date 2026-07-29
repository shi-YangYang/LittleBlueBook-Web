import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';
import {
  NotificationApiErrorDto,
  NotificationPageResponseDto,
  ReadAllNotificationsResponseDto,
  ReadNotificationResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto.js';
import { NotificationsService } from './notifications.service.js';
import type {
  NotificationPage,
  ReadAllNotificationsResult,
  ReadNotificationResult,
  UnreadCountResult,
} from './notifications.types.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the current user interaction notifications' })
  @ApiOkResponse({ type: NotificationPageResponseDto })
  @ApiBadRequestResponse({ type: NotificationApiErrorDto })
  @ApiUnauthorizedResponse({ type: NotificationApiErrorDto })
  async list(
    @Req() request: Request,
    @Query() query: ListNotificationsDto,
  ): Promise<{ data: NotificationPage }> {
    return {
      data: await this.notifications.list(
        readCookie(request, SESSION_COOKIE_NAME),
        query.tab,
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Read the current user total unread count' })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  @ApiUnauthorizedResponse({ type: NotificationApiErrorDto })
  async unreadCount(
    @Req() request: Request,
  ): Promise<{ data: UnreadCountResult }> {
    return {
      data: await this.notifications.unreadCount(
        readCookie(request, SESSION_COOKIE_NAME),
      ),
    };
  }

  @Put('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all current user notifications as read' })
  @ApiOkResponse({ type: ReadAllNotificationsResponseDto })
  @ApiUnauthorizedResponse({ type: NotificationApiErrorDto })
  async readAll(
    @Req() request: Request,
  ): Promise<{ data: ReadAllNotificationsResult }> {
    return {
      data: await this.notifications.readAll(
        readCookie(request, SESSION_COOKIE_NAME),
      ),
    };
  }

  @Put(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one owned notification as read' })
  @ApiOkResponse({ type: ReadNotificationResponseDto })
  @ApiUnauthorizedResponse({ type: NotificationApiErrorDto })
  @ApiNotFoundResponse({ type: NotificationApiErrorDto })
  async read(
    @Req() request: Request,
    @Param('notificationId') notificationId: string,
  ): Promise<{ data: ReadNotificationResult }> {
    return {
      data: await this.notifications.read(
        readCookie(request, SESSION_COOKIE_NAME),
        notificationId,
      ),
    };
  }
}
