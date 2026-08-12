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
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookies.js';
import {
  AdminListReportsDto,
  CreateReportDto,
  ListReportsDto,
  ModerationActionDto,
  ModerationReasonDto,
} from './dto/safety.dto.js';
import {
  AdminReportPageResponseDto,
  BlockedUserPageResponseDto,
  BlockStateResponseDto,
  DismissedReportResponseDto,
  ModerationResultResponseDto,
  ReportPageResponseDto,
  ReportResponseDto,
  SafetyApiErrorDto,
} from './dto/safety-response.dto.js';
import { SafetyService } from './safety.service.js';

@ApiTags('safety')
@Controller('safety')
export class SafetyController {
  constructor(@Inject(SafetyService) private readonly safety: SafetyService) {}

  @Post('reports')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or return the pending report for a target' })
  @ApiOkResponse({ type: ReportResponseDto })
  @ApiBadRequestResponse({ type: SafetyApiErrorDto })
  @ApiUnauthorizedResponse({ type: SafetyApiErrorDto })
  @ApiNotFoundResponse({ type: SafetyApiErrorDto })
  @ApiTooManyRequestsResponse({ type: SafetyApiErrorDto })
  async report(@Req() request: Request, @Body() input: CreateReportDto) {
    return {
      data: await this.safety.createReport(this.session(request), input),
    };
  }

  @Get('reports')
  @ApiOperation({ summary: 'List the current user reports' })
  @ApiOkResponse({ type: ReportPageResponseDto })
  @ApiBadRequestResponse({ type: SafetyApiErrorDto })
  @ApiUnauthorizedResponse({ type: SafetyApiErrorDto })
  async reports(@Req() request: Request, @Query() query: ListReportsDto) {
    return {
      data: await this.safety.reports(this.session(request), query.cursor),
    };
  }

  @Post('users/:userId/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user and remove both follow directions' })
  @ApiOkResponse({ type: BlockStateResponseDto })
  @ApiUnauthorizedResponse({ type: SafetyApiErrorDto })
  @ApiNotFoundResponse({ type: SafetyApiErrorDto })
  async block(@Req() request: Request, @Param('userId') userId: string) {
    return { data: await this.safety.block(this.session(request), userId) };
  }

  @Delete('users/:userId/block')
  @ApiOperation({ summary: 'Remove the current user directional block' })
  @ApiOkResponse({ type: BlockStateResponseDto })
  @ApiUnauthorizedResponse({ type: SafetyApiErrorDto })
  @ApiNotFoundResponse({ type: SafetyApiErrorDto })
  async unblock(@Req() request: Request, @Param('userId') userId: string) {
    return { data: await this.safety.unblock(this.session(request), userId) };
  }

  @Get('blocked-users')
  @ApiOperation({ summary: 'List users actively blocked by the current user' })
  @ApiOkResponse({ type: BlockedUserPageResponseDto })
  @ApiBadRequestResponse({ type: SafetyApiErrorDto })
  @ApiUnauthorizedResponse({ type: SafetyApiErrorDto })
  async blocked(@Req() request: Request, @Query() query: ListReportsDto) {
    return {
      data: await this.safety.blockedUsers(this.session(request), query.cursor),
    };
  }

  private session(request: Request) {
    return readCookie(request, SESSION_COOKIE_NAME);
  }
}

@ApiTags('admin-moderation')
@Controller('admin/moderation')
export class ModerationController {
  constructor(@Inject(SafetyService) private readonly safety: SafetyService) {}

  @Get()
  @ApiOperation({ summary: 'List reports for administrator moderation' })
  @ApiOkResponse({ type: AdminReportPageResponseDto })
  @ApiBadRequestResponse({ type: SafetyApiErrorDto })
  @ApiNotFoundResponse({ type: SafetyApiErrorDto })
  async reports(@Req() request: Request, @Query() query: AdminListReportsDto) {
    return {
      data: await this.safety.adminReports(this.session(request), query),
    };
  }

  @Post('reports/:reportId/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss one pending report' })
  @ApiOkResponse({ type: DismissedReportResponseDto })
  @ApiBadRequestResponse({ type: SafetyApiErrorDto })
  @ApiNotFoundResponse({ type: SafetyApiErrorDto })
  @ApiConflictResponse({ type: SafetyApiErrorDto })
  async dismiss(
    @Req() request: Request,
    @Param('reportId') reportId: string,
    @Body() input: ModerationReasonDto,
  ) {
    return {
      data: await this.safety.dismiss(
        this.session(request),
        reportId,
        input.reason,
      ),
    };
  }

  @Post('actions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a reversible moderation action' })
  @ApiOkResponse({ type: ModerationResultResponseDto })
  @ApiBadRequestResponse({ type: SafetyApiErrorDto })
  @ApiNotFoundResponse({ type: SafetyApiErrorDto })
  @ApiConflictResponse({ type: SafetyApiErrorDto })
  async moderate(@Req() request: Request, @Body() input: ModerationActionDto) {
    return { data: await this.safety.moderate(this.session(request), input) };
  }

  private session(request: Request) {
    return readCookie(request, SESSION_COOKIE_NAME);
  }
}
