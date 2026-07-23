import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /healthz', () => {
  it('returns the frontend health response', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'frontend',
    });
  });
});
