import {
  Body,
  Controller,
  Delete,
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
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import { CommentDto } from './dto/comment.dto.js';
import {
  CommentDeletionResponseDto,
  CommentMutationResponseDto,
  CommentPageResponseDto,
  FollowResponseDto,
  InteractionApiErrorDto,
  RelationshipResponseDto,
} from './dto/interaction-response.dto.js';
import { ListCommentsDto } from './dto/list-comments.dto.js';
import { InteractionsService } from './interactions.service.js';
import type {
  CommentDeletionResult,
  CommentMutationResult,
  CommentPage,
  FollowResult,
  RelationshipResult,
} from './interactions.types.js';

@ApiTags('note interactions')
@Controller('notes/:noteId')
export class NoteInteractionsController {
  constructor(
    @Inject(InteractionsService)
    private readonly interactions: InteractionsService,
  ) {}

  @Put('like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the current user note-like state to active' })
  @ApiOkResponse({
    description: 'Final like state and authoritative count',
    type: RelationshipResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The note does not exist',
    type: InteractionApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'Self-like is not allowed',
    type: InteractionApiErrorDto,
  })
  async like(
    @Req() request: Request,
    @Param('noteId') noteId: string,
  ): Promise<{ data: RelationshipResult }> {
    return {
      data: await this.interactions.setLike(
        readCookie(request, SESSION_COOKIE_NAME),
        noteId,
        true,
      ),
    };
  }

  @Delete('like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the current user note-like state to inactive' })
  @ApiOkResponse({
    description: 'Final like state and authoritative count',
    type: RelationshipResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The note does not exist',
    type: InteractionApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'Self-like is not allowed',
    type: InteractionApiErrorDto,
  })
  async unlike(
    @Req() request: Request,
    @Param('noteId') noteId: string,
  ): Promise<{ data: RelationshipResult }> {
    return {
      data: await this.interactions.setLike(
        readCookie(request, SESSION_COOKIE_NAME),
        noteId,
        false,
      ),
    };
  }

  @Put('favorite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the current user favorite state to active' })
  @ApiOkResponse({
    description: 'Final favorite state and authoritative count',
    type: RelationshipResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The note does not exist',
    type: InteractionApiErrorDto,
  })
  async favorite(
    @Req() request: Request,
    @Param('noteId') noteId: string,
  ): Promise<{ data: RelationshipResult }> {
    return {
      data: await this.interactions.setFavorite(
        readCookie(request, SESSION_COOKIE_NAME),
        noteId,
        true,
      ),
    };
  }

  @Delete('favorite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the current user favorite state to inactive' })
  @ApiOkResponse({
    description: 'Final favorite state and authoritative count',
    type: RelationshipResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The note does not exist',
    type: InteractionApiErrorDto,
  })
  async unfavorite(
    @Req() request: Request,
    @Param('noteId') noteId: string,
  ): Promise<{ data: RelationshipResult }> {
    return {
      data: await this.interactions.setFavorite(
        readCookie(request, SESSION_COOKIE_NAME),
        noteId,
        false,
      ),
    };
  }

  @Get('comments')
  @ApiOperation({ summary: 'List public first-level comments newest first' })
  @ApiOkResponse({
    description: 'A cursor-paginated comment page',
    type: CommentPageResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Pagination or cursor validation failed',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The note does not exist',
    type: InteractionApiErrorDto,
  })
  async comments(
    @Req() request: Request,
    @Param('noteId') noteId: string,
    @Query() query: ListCommentsDto,
  ): Promise<{ data: CommentPage }> {
    return {
      data: await this.interactions.comments(
        readCookie(request, SESSION_COOKIE_NAME),
        noteId,
        query.cursor,
        query.limit,
      ),
    };
  }

  @Post('comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish one authenticated plain-text comment' })
  @ApiCreatedResponse({
    description: 'The complete created comment',
    type: CommentMutationResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The note does not exist',
    type: InteractionApiErrorDto,
  })
  @ApiBadRequestResponse({
    description: 'Comment validation failed',
    type: InteractionApiErrorDto,
  })
  async comment(
    @Req() request: Request,
    @Param('noteId') noteId: string,
    @Body() input: CommentDto,
  ): Promise<{ data: CommentMutationResult }> {
    return {
      data: await this.interactions.createComment(
        readCookie(request, SESSION_COOKIE_NAME),
        noteId,
        input.content,
      ),
    };
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a comment when authorized' })
  @ApiOkResponse({
    description: 'Deletion result and authoritative count',
    type: CommentDeletionResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required',
    type: InteractionApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'The current user cannot delete it',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The note or comment does not exist',
    type: InteractionApiErrorDto,
  })
  async deleteComment(
    @Req() request: Request,
    @Param('noteId') noteId: string,
    @Param('commentId') commentId: string,
  ): Promise<{ data: CommentDeletionResult }> {
    return {
      data: await this.interactions.deleteComment(
        readCookie(request, SESSION_COOKIE_NAME),
        noteId,
        commentId,
      ),
    };
  }
}

@ApiTags('user interactions')
@Controller('users')
export class UserInteractionsController {
  constructor(
    @Inject(InteractionsService)
    private readonly interactions: InteractionsService,
  ) {}

  @Put(':userId/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the current user follow state to active' })
  @ApiOkResponse({
    description: 'Final follow state',
    type: FollowResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The target user does not exist',
    type: InteractionApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'Self-follow is not allowed',
    type: InteractionApiErrorDto,
  })
  async follow(
    @Req() request: Request,
    @Param('userId') userId: string,
  ): Promise<{ data: FollowResult }> {
    return {
      data: await this.interactions.setFollow(
        readCookie(request, SESSION_COOKIE_NAME),
        userId,
        true,
      ),
    };
  }

  @Delete(':userId/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the current user follow state to inactive' })
  @ApiOkResponse({
    description: 'Final follow state',
    type: FollowResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required',
    type: InteractionApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'The target user does not exist',
    type: InteractionApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'Self-follow is not allowed',
    type: InteractionApiErrorDto,
  })
  async unfollow(
    @Req() request: Request,
    @Param('userId') userId: string,
  ): Promise<{ data: FollowResult }> {
    return {
      data: await this.interactions.setFollow(
        readCookie(request, SESSION_COOKIE_NAME),
        userId,
        false,
      ),
    };
  }
}
