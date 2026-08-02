import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import { ListConversationsDto } from './dto/list-conversations.dto.js';
import { ListMessagesDto } from './dto/list-messages.dto.js';
import {
  ConversationDetailResponseDto,
  ConversationPageResponseDto,
  MessageApiErrorDto,
  MessagePageResponseDto,
  MessageUnreadCountResponseDto,
  ReadMessageResponseDto,
  SendMessageResponseDto,
} from './dto/message-response.dto.js';
import { ReadMessageDto } from './dto/read-message.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { MessagesService } from './messages.service.js';
import type {
  ConversationDetail,
  ConversationPage,
  MessagePage,
  MessageUnreadCount,
  ReadMessageResult,
  SendMessageResult,
} from './messages.types.js';

@ApiTags('direct messages')
@Controller('messages')
export class MessagesController {
  constructor(
    @Inject(MessagesService) private readonly messagesService: MessagesService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List current-user direct-message conversations' })
  @ApiOkResponse({ type: ConversationPageResponseDto })
  @ApiUnauthorizedResponse({ type: MessageApiErrorDto })
  async conversations(
    @Req() request: Request,
    @Query() query: ListConversationsDto,
  ): Promise<{ data: ConversationPage }> {
    return {
      data: await this.messagesService.conversations(
        readCookie(request, SESSION_COOKIE_NAME),
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'Read owned conversation metadata' })
  @ApiOkResponse({ type: ConversationDetailResponseDto })
  async conversation(
    @Req() request: Request,
    @Param('conversationId') conversationId: string,
  ): Promise<{ data: ConversationDetail }> {
    return {
      data: await this.messagesService.conversation(
        readCookie(request, SESSION_COOKIE_NAME),
        conversationId,
      ),
    };
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Read or synchronize owned conversation messages' })
  @ApiOkResponse({ type: MessagePageResponseDto })
  async messages(
    @Req() request: Request,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesDto,
  ): Promise<{ data: MessagePage }> {
    return {
      data: await this.messagesService.messages(
        readCookie(request, SESSION_COOKIE_NAME),
        conversationId,
        query.cursor,
        query.after,
      ),
    };
  }

  @Post('users/:userId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a first or subsequent message to a mutual follow',
  })
  @ApiCreatedResponse({ type: SendMessageResponseDto })
  async sendToUser(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() input: SendMessageDto,
  ): Promise<{ data: SendMessageResult }> {
    return {
      data: await this.messagesService.sendToUser(
        readCookie(request, SESSION_COOKIE_NAME),
        userId,
        input.content,
        input.clientRequestId,
      ),
    };
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message in an existing owned conversation' })
  @ApiCreatedResponse({ type: SendMessageResponseDto })
  async sendToConversation(
    @Req() request: Request,
    @Param('conversationId') conversationId: string,
    @Body() input: SendMessageDto,
  ): Promise<{ data: SendMessageResult }> {
    return {
      data: await this.messagesService.sendToConversation(
        readCookie(request, SESSION_COOKIE_NAME),
        conversationId,
        input.content,
        input.clientRequestId,
      ),
    };
  }

  @Put('conversations/:conversationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Advance the current-user read boundary' })
  @ApiOkResponse({ type: ReadMessageResponseDto })
  async markRead(
    @Req() request: Request,
    @Param('conversationId') conversationId: string,
    @Body() input: ReadMessageDto,
  ): Promise<{ data: ReadMessageResult }> {
    return {
      data: await this.messagesService.markRead(
        readCookie(request, SESSION_COOKIE_NAME),
        conversationId,
        input.messageId,
      ),
    };
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Read total current-user direct-message unread count',
  })
  @ApiOkResponse({ type: MessageUnreadCountResponseDto })
  async unreadCount(
    @Req() request: Request,
  ): Promise<{ data: MessageUnreadCount }> {
    return {
      data: await this.messagesService.unreadCount(
        readCookie(request, SESSION_COOKIE_NAME),
      ),
    };
  }
}
