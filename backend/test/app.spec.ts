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
    expect(response.body.paths).toHaveProperty('/api/v1/notes');
    expect(response.body.paths).toHaveProperty('/api/v1/notes/recommendations');
    expect(response.body.paths).toHaveProperty('/api/v1/notes/mine');
    expect(response.body.paths).toHaveProperty('/api/v1/notes/{noteId}');
    expect(response.body.paths).toHaveProperty('/api/v1/media/{objectKey}');
  });

  it('does not create business routes in the API namespace', async () => {
    await request(app.getHttpServer()).get('/api/v1').expect(404);
  });
});
