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
        fields: 3,
        fieldSize: 16 * 1024,
      },
    }),
  )
  @ApiOperation({ summary: 'Publish an authenticated image note' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'content', 'clientRequestId', 'images'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 50 },
        content: { type: 'string', minLength: 1, maxLength: 2000 },
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

  @Get('recommendations')
  @ApiOperation({ summary: 'List public notes newest first' })
  @ApiOkResponse({ description: 'A cursor-paginated public note feed' })
  async recommendations(
    @Query() query: ListNotesDto,
  ): Promise<{ data: NotePage }> {
    return {
      data: await this.notes.recommendations(query.cursor, query.limit),
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

  @Get(':noteId')
  @ApiOperation({ summary: 'Read a public note detail' })
  @ApiOkResponse({ description: 'The complete public note detail' })
  @ApiNotFoundResponse({ description: 'The note does not exist' })
  async detail(@Param('noteId') noteId: string): Promise<{ data: NoteDetail }> {
    return { data: await this.notes.detail(noteId) };
  }
}
