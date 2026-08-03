import type { INestApplication } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import request from 'supertest';

import { createApplication } from '../src/bootstrap.js';

describe('backend application', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the liveness endpoint', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({
      status: 'ok',
      service: 'backend',
    });
  });

  it('allows the equivalent localhost origin during local development', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/channels')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('serves OpenAPI JSON outside production', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    expect(response.body.info.title).toBe('LittleBlueBook API');
    expect(response.body.paths).toHaveProperty('/health/live');
    expect(response.body.paths).toHaveProperty(
      '/api/v1/auth/email-code/request',
    );
    expect(response.body.paths).toHaveProperty(
      '/api/v1/auth/email-code/verify',
    );
    expect(response.body.paths).toHaveProperty(
      '/api/v1/auth/registration/complete',
    );
    expect(response.body.paths).toHaveProperty('/api/v1/auth/legal-status');
    expect(response.body.paths).toHaveProperty('/api/v1/auth/legal-acceptance');
    expect(response.body.paths).toHaveProperty('/api/v1/profile/me');
    expect(response.body.paths).toHaveProperty('/api/v1/profile/me/settings');
    expect(response.body.paths).toHaveProperty('/api/v1/channels');
    expect(response.body.paths).toHaveProperty('/api/v1/notes');
    expect(response.body.paths).toHaveProperty('/api/v1/notes/recommendations');
    expect(response.body.paths).toHaveProperty(
      '/api/v1/notes/channels/{channelCode}',
    );
    expect(response.body.paths).toHaveProperty('/api/v1/notes/mine');
    expect(response.body.paths).toHaveProperty('/api/v1/notes/{noteId}');
    expect(response.body.paths).toHaveProperty('/api/v1/search/notes');
    expect(response.body.paths).toHaveProperty('/api/v1/search/videos');
    expect(response.body.paths).toHaveProperty('/api/v1/search/users');
    expect(response.body.paths).toHaveProperty(
      '/api/v1/users/{userId}/profile',
    );
    expect(response.body.paths).toHaveProperty('/api/v1/users/{userId}/notes');
    expect(response.body.paths).toHaveProperty('/api/v1/media/{objectKey}');
    expect(response.body.paths).toHaveProperty('/api/v1/notifications');
    expect(response.body.paths).toHaveProperty(
      '/api/v1/notifications/unread-count',
    );
    expect(response.body.paths).toHaveProperty(
      '/api/v1/notifications/read-all',
    );
    expect(response.body.paths).toHaveProperty(
      '/api/v1/notifications/{notificationId}/read',
    );
    expect(
      response.body.paths['/api/v1/notes'].post.requestBody.content[
        'multipart/form-data'
      ].schema.required,
    ).toContain('channelCode');
    expect(
      response.body.paths['/api/v1/channels'].get.responses['200'].content[
        'application/json'
      ].schema.properties.data.properties.items.items.properties,
    ).toEqual(
      expect.objectContaining({
        code: expect.any(Object),
        name: expect.any(Object),
        displayOrder: expect.any(Object),
      }),
    );
    const schemas = response.body.components.schemas;
    expect(schemas.NoteChannelResponseDto.properties).toEqual(
      expect.objectContaining({
        code: expect.any(Object),
        name: expect.any(Object),
        navigable: expect.any(Object),
      }),
    );

    const successResponses = [
      ['/api/v1/notes/{noteId}/like', 'put', '200'],
      ['/api/v1/notes/{noteId}/like', 'delete', '200'],
      ['/api/v1/notes/{noteId}/favorite', 'put', '200'],
      ['/api/v1/notes/{noteId}/favorite', 'delete', '200'],
      ['/api/v1/users/{userId}/follow', 'put', '200'],
      ['/api/v1/users/{userId}/follow', 'delete', '200'],
      ['/api/v1/notes/{noteId}/comments', 'get', '200'],
      ['/api/v1/notes/{noteId}/comments', 'post', '201'],
      ['/api/v1/notes/{noteId}/comments/{commentId}', 'delete', '200'],
    ] as const;
    for (const [path, method, status] of successResponses) {
      expect(
        response.body.paths[path][method].responses[status].content[
          'application/json'
        ].schema.$ref,
      ).toMatch(/^#\/components\/schemas\/.+ResponseDto$/);
    }

    expect(schemas.RelationshipResultDto.properties).toEqual(
      expect.objectContaining({
        active: expect.any(Object),
        count: expect.any(Object),
      }),
    );
    expect(schemas.FollowResultDto.properties).toHaveProperty('following');
    expect(schemas.CommentPageDto.properties).toEqual(
      expect.objectContaining({
        items: expect.any(Object),
        nextCursor: expect.any(Object),
        total: expect.any(Object),
      }),
    );
    expect(schemas.NoteCommentDto.properties).toEqual(
      expect.objectContaining({
        id: expect.any(Object),
        content: expect.any(Object),
        createdAt: expect.any(Object),
        author: expect.any(Object),
        isAuthor: expect.any(Object),
        canDelete: expect.any(Object),
      }),
    );
    expect(schemas.CommentMutationResultDto.properties).toEqual(
      expect.objectContaining({
        comment: expect.any(Object),
        total: expect.any(Object),
      }),
    );
    expect(schemas.CommentDeletionResultDto.properties).toEqual(
      expect.objectContaining({
        deleted: expect.any(Object),
        total: expect.any(Object),
      }),
    );

    const errorResponses = [
      ['/api/v1/notes/{noteId}/like', 'put', '401'],
      ['/api/v1/notes/{noteId}/like', 'put', '404'],
      ['/api/v1/notes/{noteId}/like', 'put', '409'],
      ['/api/v1/notes/{noteId}/favorite', 'put', '401'],
      ['/api/v1/notes/{noteId}/favorite', 'put', '404'],
      ['/api/v1/users/{userId}/follow', 'put', '401'],
      ['/api/v1/users/{userId}/follow', 'put', '404'],
      ['/api/v1/users/{userId}/follow', 'put', '409'],
      ['/api/v1/notes/{noteId}/comments', 'get', '400'],
      ['/api/v1/notes/{noteId}/comments', 'get', '404'],
      ['/api/v1/notes/{noteId}/comments', 'post', '400'],
      ['/api/v1/notes/{noteId}/comments', 'post', '401'],
      ['/api/v1/notes/{noteId}/comments', 'post', '404'],
      ['/api/v1/notes/{noteId}/comments/{commentId}', 'delete', '401'],
      ['/api/v1/notes/{noteId}/comments/{commentId}', 'delete', '403'],
      ['/api/v1/notes/{noteId}/comments/{commentId}', 'delete', '404'],
    ] as const;
    for (const [path, method, status] of errorResponses) {
      expect(
        response.body.paths[path][method].responses[status].content[
          'application/json'
        ].schema.$ref,
      ).toBe('#/components/schemas/InteractionApiErrorDto');
    }
    expect(schemas.InteractionApiErrorDto.properties).toEqual(
      expect.objectContaining({
        statusCode: expect.any(Object),
        code: expect.any(Object),
        message: expect.any(Object),
      }),
    );
    expect(schemas.SearchUserCardDto.properties).toEqual(
      expect.objectContaining({
        id: expect.any(Object),
        nickname: expect.any(Object),
        littleBlueBookId: expect.any(Object),
        avatar: expect.any(Object),
        followers: expect.any(Object),
        notes: expect.any(Object),
        viewer: expect.any(Object),
      }),
    );
    expect(schemas.SearchUserCardDto.properties).not.toHaveProperty('email');
    expect(schemas.SearchUserCardDto.properties).not.toHaveProperty('age');
    expect(schemas.PublicUserProfileDto.properties).toEqual(
      expect.objectContaining({
        id: expect.any(Object),
        nickname: expect.any(Object),
        littleBlueBookId: expect.any(Object),
        gender: expect.any(Object),
        age: expect.any(Object),
        bio: expect.any(Object),
        avatar: expect.any(Object),
        stats: expect.any(Object),
        viewer: expect.any(Object),
      }),
    );
    expect(schemas.PublicUserProfileDto.properties).not.toHaveProperty('email');
    expect(schemas.PublicUserProfileDto.properties).not.toHaveProperty(
      'birthDate',
    );
    expect(schemas.PublicUserProfileDto.properties).not.toHaveProperty(
      'avatarObjectKey',
    );
    expect(schemas.NotificationItemDto.properties).toEqual(
      expect.objectContaining({
        id: expect.any(Object),
        type: expect.any(Object),
        action: expect.any(Object),
        createdAt: expect.any(Object),
        readAt: expect.any(Object),
        actor: expect.any(Object),
        note: expect.any(Object),
        comment: expect.any(Object),
      }),
    );
    expect(schemas.NotificationActorDto.properties).not.toHaveProperty('email');
    expect(schemas.NotificationActorDto.properties).not.toHaveProperty(
      'createdAt',
    );
    expect(schemas.ProfileAvatarDto.properties.type.enum).toEqual([
      'initial',
      'image',
    ]);
    for (const schemaName of [
      'CurrentProfileDto',
      'PublicProfileDto',
      'NoteAuthorResponseDto',
      'CommentAuthorDto',
      'NotificationActorDto',
      'NoteAuthorDto',
      'SearchUserCardDto',
      'PublicUserProfileDto',
    ]) {
      expect(schemas[schemaName].properties.avatar.$ref).toBe(
        '#/components/schemas/ProfileAvatarDto',
      );
    }
    expect(schemas.CurrentProfileDto.properties).toEqual(
      expect.objectContaining({
        nickname: expect.any(Object),
        littleBlueBookId: expect.any(Object),
        gender: expect.any(Object),
        age: expect.any(Object),
        bio: expect.any(Object),
        avatar: expect.any(Object),
        stats: expect.any(Object),
      }),
    );
    for (const schemaName of ['CurrentProfileDto', 'PublicProfileDto']) {
      expect(schemas[schemaName].properties).not.toHaveProperty('email');
      expect(schemas[schemaName].properties).not.toHaveProperty('birthDate');
      expect(schemas[schemaName].properties).not.toHaveProperty(
        'avatarObjectKey',
      );
    }
    expect(schemas.PrivateProfileSettingsDto.properties).not.toHaveProperty(
      'avatarObjectKey',
    );
  });

  it('creates the Swagger document with the tsx development runtime', () => {
    const backendRoot = resolve(__dirname, '..');
    const runtimeRequire = createRequire(resolve(backendRoot, 'package.json'));
    const tsxCli = runtimeRequire.resolve('tsx/cli');
    const result = spawnSync(
      process.execPath,
      [
        tsxCli,
        '--eval',
        [
          "import 'reflect-metadata';",
          'void (async () => {',
          "const { createApplication } = await import('./src/bootstrap.ts');",
          'const app = await createApplication();',
          'await app.close();',
          '})().catch((error) => { console.error(error); process.exitCode = 1; });',
        ].join(' '),
      ],
      {
        cwd: backendRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          SWAGGER_ENABLED: 'true',
        },
        timeout: 30_000,
      },
    );

    expect({
      status: result.status,
      signal: result.signal,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      signal: null,
      stderr: '',
    });
  }, 35_000);

  it('documents and returns the real profile multipart validation contract', async () => {
    const invalidValue = 'must-not-leak-C:\\private\\avatar.png';
    const singleFieldResponse = await request(app.getHttpServer())
      .patch('/api/v1/profile/me/settings')
      .field('nickname', '资料蓝友')
      .field('gender', invalidValue)
      .field('birthDate', '')
      .field('showAge', 'false')
      .field('bio', '')
      .field('avatarAction', 'keep')
      .field('profileVersion', '00000000-0000-4000-8000-000000000202')
      .expect(400);

    expect(singleFieldResponse.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: '请求参数无效',
      details: { fields: ['gender'] },
    });
    expect(JSON.stringify(singleFieldResponse.body)).not.toContain(
      invalidValue,
    );
    expect(JSON.stringify(singleFieldResponse.body)).not.toMatch(
      /(?:private|stack|prisma|multer|filesystem)/i,
    );

    const multipleFieldResponse = await request(app.getHttpServer())
      .patch('/api/v1/profile/me/settings')
      .field('nickname', '资料蓝友')
      .field('gender', invalidValue)
      .field('birthDate', '')
      .field('showAge', invalidValue)
      .field('bio', '')
      .field('avatarAction', 'keep')
      .field('profileVersion', '00000000-0000-4000-8000-000000000202')
      .expect(400);
    expect(multipleFieldResponse.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: '请求参数无效',
      details: { fields: ['gender', 'showAge'] },
    });
    expect(JSON.stringify(multipleFieldResponse.body)).not.toContain(
      invalidValue,
    );

    const multipartResponseRequest = request(app.getHttpServer()).patch(
      '/api/v1/profile/me/settings',
    );
    for (let index = 0; index < 11; index += 1) {
      multipartResponseRequest.field(`field${index}`, invalidValue);
    }
    const multipartResponse = await multipartResponseRequest.expect(400);
    expect(multipartResponse.body).toEqual({
      statusCode: 400,
      code: 'MULTIPART_INVALID',
      message: '图片数量或上传数据不符合要求',
    });
    expect(JSON.stringify(multipartResponse.body)).not.toContain(invalidValue);
    expect(multipartResponse.body).not.toHaveProperty('details');

    const document = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const patch = document.body.paths['/api/v1/profile/me/settings'].patch;
    const schemas = document.body.components.schemas;
    const badRequestSchema =
      patch.responses['400'].content['application/json'].schema;
    expect(patch.responses['400'].description).toContain('VALIDATION_ERROR');
    expect(badRequestSchema.oneOf).toEqual([
      { $ref: '#/components/schemas/ProfileValidationErrorResponseDto' },
      {
        $ref: '#/components/schemas/ProfileBusinessValidationErrorResponseDto',
      },
      { $ref: '#/components/schemas/ProfileAvatarInvalidErrorResponseDto' },
      { $ref: '#/components/schemas/ProfileMultipartInvalidErrorResponseDto' },
    ]);
    expect(badRequestSchema.discriminator).toEqual({
      propertyName: 'code',
      mapping: {
        VALIDATION_ERROR:
          '#/components/schemas/ProfileValidationErrorResponseDto',
        PROFILE_VALIDATION_FAILED:
          '#/components/schemas/ProfileBusinessValidationErrorResponseDto',
        AVATAR_INVALID:
          '#/components/schemas/ProfileAvatarInvalidErrorResponseDto',
        MULTIPART_INVALID:
          '#/components/schemas/ProfileMultipartInvalidErrorResponseDto',
      },
    });
    expect(
      badRequestSchema.discriminator.mapping[singleFieldResponse.body.code],
    ).toBe('#/components/schemas/ProfileValidationErrorResponseDto');
    expect(
      badRequestSchema.discriminator.mapping[multipartResponse.body.code],
    ).toBe('#/components/schemas/ProfileMultipartInvalidErrorResponseDto');

    expect(schemas.ProfileValidationErrorResponseDto.required).toEqual(
      expect.arrayContaining(['statusCode', 'code', 'message', 'details']),
    );
    expect(
      schemas.ProfileValidationErrorResponseDto.properties.details.$ref,
    ).toBe('#/components/schemas/ProfileValidationErrorDetailsDto');
    expect(schemas.ProfileValidationErrorDetailsDto.required).toContain(
      'fields',
    );
    expect(schemas.ProfileValidationErrorDetailsDto.properties.fields).toEqual(
      expect.objectContaining({
        type: 'array',
        uniqueItems: true,
        items: { type: 'string' },
      }),
    );
    expect(
      schemas.ProfileBusinessValidationErrorResponseDto.required,
    ).toContain('details');
    expect(schemas.ProfileBusinessValidationErrorDetailsDto.required).toContain(
      'field',
    );
    for (const schemaName of [
      'ProfileAvatarInvalidErrorResponseDto',
      'ProfileMultipartInvalidErrorResponseDto',
    ]) {
      expect(schemas[schemaName].required).toEqual(
        expect.arrayContaining(['statusCode', 'code', 'message']),
      );
      expect(schemas[schemaName].properties).not.toHaveProperty('details');
    }
  });

  it('does not create business routes in the API namespace', async () => {
    await request(app.getHttpServer()).get('/api/v1').expect(404);
  });
});
