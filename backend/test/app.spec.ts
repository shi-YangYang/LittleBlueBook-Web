import type { INestApplication } from '@nestjs/common';
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
    expect(response.body.paths).toHaveProperty('/api/v1/profile/me');
    expect(response.body.paths).toHaveProperty('/api/v1/channels');
    expect(response.body.paths).toHaveProperty('/api/v1/notes');
    expect(response.body.paths).toHaveProperty('/api/v1/notes/recommendations');
    expect(response.body.paths).toHaveProperty(
      '/api/v1/notes/channels/{channelCode}',
    );
    expect(response.body.paths).toHaveProperty('/api/v1/notes/mine');
    expect(response.body.paths).toHaveProperty('/api/v1/notes/{noteId}');
    expect(response.body.paths).toHaveProperty('/api/v1/media/{objectKey}');
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
    expect(
      response.body.paths['/api/v1/notes/{noteId}'].get.responses['200']
        .content['application/json'].schema.properties.data.properties.channel
        .properties,
    ).toEqual(
      expect.objectContaining({
        code: expect.any(Object),
        name: expect.any(Object),
        navigable: expect.any(Object),
      }),
    );
  });

  it('does not create business routes in the API namespace', async () => {
    await request(app.getHttpServer()).get('/api/v1').expect(404);
  });
});
