import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadLegalConfig } = vi.hoisted(() => ({ loadLegalConfig: vi.fn() }));

vi.mock('../../config/legal-config', () => ({ loadLegalConfig }));

import { GET } from './route';

describe('GET /healthz', () => {
  beforeEach(() => loadLegalConfig.mockResolvedValue({}));

  it('returns the frontend health response', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'frontend',
    });
  });

  it('returns a sanitized unavailable response when legal configuration is missing', async () => {
    loadLegalConfig.mockRejectedValueOnce(new Error('private path'));
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'error',
      service: 'frontend',
    });
  });
});
