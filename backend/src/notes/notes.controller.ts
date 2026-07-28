import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import type { UploadedMemoryFile } from '../media/media.types.js';
import { ListNotesDto } from './dto/list-notes.dto.js';
import { PublishNoteDto } from './dto/publish-note.dto.js';
import { NotesService } from './notes.service.js';
import type { NoteDetail, NotePage, PublishResult } from './notes.types.js';

@ApiTags('notes')
@Controller('notes')
export class NotesController {
  constructor(@Inject(NotesService) private readonly notes: NotesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor('images', 9, {
      limits: {
        files: 9,
        fileSize: 10 * 1024 * 1024,
        fields: 4,
        fieldSize: 16 * 1024,
      },
    }),
  )
  @ApiOperation({ summary: 'Publish an authenticated image note' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'title',
        'content',
        'channelCode',
        'clientRequestId',
        'images',
      ],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 50 },
        content: { type: 'string', minLength: 1, maxLength: 2000 },
        channelCode: {
          type: 'string',
          minLength: 2,
          maxLength: 32,
          pattern: '^[a-z][a-z0-9-]{1,31}$',
          example: 'digital',
        },
        clientRequestId: { type: 'string', format: 'uuid' },
        images: {
          type: 'array',
          minItems: 1,
          maxItems: 9,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'The note was published' })
  @ApiBadRequestResponse({ description: 'Text or image validation failed' })
  @ApiTooManyRequestsResponse({ description: 'Publish rate limit reached' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  async publish(
    @Req() request: Request,
    @Body() input: PublishNoteDto,
    @UploadedFiles() files: UploadedMemoryFile[] | undefined,
  ): Promise<{ data: PublishResult }> {
    return {
      data: await this.notes.publish(
        readCookie(request, SESSION_COOKIE_NAME),
        input,
        files ?? [],
      ),
    };
  }

  @Get('channels/:channelCode')
  @ApiOperation({ summary: 'List public notes in one enabled channel' })
  @ApiParam({
    name: 'channelCode',
    description: 'Stable public channel code',
    example: 'digital',
    schema: {
      type: 'string',
      pattern: '^[a-z][a-z0-9-]{1,31}$',
      minLength: 2,
      maxLength: 32,
    },
  })
  @ApiOkResponse({ description: 'A cursor-paginated channel note feed' })
  @ApiNotFoundResponse({ description: 'The channel is missing or disabled' })
  async channel(
    @Req() request: Request,
    @Param('channelCode') channelCode: string,
    @Query() query: ListNotesDto,
  ): Promise<{ data: NotePage }> {
    return {
      data: await this.notes.channel(
        readCookie(request, SESSION_COOKIE_NAME),
        channelCode,
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'List public notes newest first' })
  @ApiOkResponse({ description: 'A cursor-paginated public note feed' })
  async recommendations(
    @Req() request: Request,
    @Query() query: ListNotesDto,
  ): Promise<{ data: NotePage }> {
    return {
      data: await this.notes.recommendations(
        readCookie(request, SESSION_COOKIE_NAME),
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('mine')
  @ApiOperation({ summary: 'List notes by the current authenticated user' })
  @ApiOkResponse({ description: 'The current user note page' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  async mine(
    @Req() request: Request,
    @Query() query: ListNotesDto,
  ): Promise<{ data: NotePage }> {
    return {
      data: await this.notes.mine(
        readCookie(request, SESSION_COOKIE_NAME),
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('favorites')
  @ApiOperation({ summary: 'List notes favorited by the current user' })
  @ApiOkResponse({ description: 'Notes ordered by favorite time descending' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  async favorites(
    @Req() request: Request,
    @Query() query: ListNotesDto,
  ): Promise<{ data: NotePage }> {
    return {
      data: await this.notes.favorites(
        readCookie(request, SESSION_COOKIE_NAME),
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get('liked')
  @ApiOperation({ summary: 'List notes liked by the current user' })
  @ApiOkResponse({ description: 'Notes ordered by like time descending' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  async liked(
    @Req() request: Request,
    @Query() query: ListNotesDto,
  ): Promise<{ data: NotePage }> {
    return {
      data: await this.notes.liked(
        readCookie(request, SESSION_COOKIE_NAME),
        query.cursor,
        query.limit,
      ),
    };
  }

  @Get(':noteId')
  @ApiOperation({ summary: 'Read a public note detail' })
  @ApiOkResponse({
    description:
      'The complete public note detail, including its public channel',
    schema: {
      type: 'object',
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          required: [
            'id',
            'title',
            'content',
            'createdAt',
            'author',
            'channel',
            'images',
            'interactions',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            content: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            author: { type: 'object' },
            channel: {
              type: 'object',
              nullable: true,
              description:
                'Null for an internal legacy channel; navigable is false when a public channel is disabled',
              required: ['code', 'name', 'navigable'],
              properties: {
                code: { type: 'string', example: 'digital' },
                name: { type: 'string', example: '数码' },
                navigable: { type: 'boolean' },
              },
            },
            images: { type: 'array', items: { type: 'object' } },
            interactions: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'The note does not exist' })
  async detail(
    @Req() request: Request,
    @Param('noteId') noteId: string,
  ): Promise<{ data: NoteDetail }> {
    return {
      data: await this.notes.detail(
        readCookie(request, SESSION_COOKIE_NAME),
        noteId,
      ),
    };
  }
}
