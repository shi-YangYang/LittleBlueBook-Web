import { describe, expect, it } from 'vitest';

import {
  LegalConfigUnavailableError,
  parseLegalConfig,
} from './legal-config-schema';

const validConfig = {
  operator: { displayName: '测试运营主体' },
  contact: { email: 'legal@test.example' },
  legal: { governingLaw: 'CN_MAINLAND', effectiveDate: '2026-08-03' },
};

describe('legal configuration', () => {
  it('accepts the supported structured configuration', () => {
    expect(parseLegalConfig(validConfig)).toEqual(validConfig);
  });

  it.each([
    undefined,
    {},
    { ...validConfig, operator: { displayName: '请填写运营主体' } },
    { ...validConfig, contact: { email: 'invalid' } },
    {
      ...validConfig,
      legal: { ...validConfig.legal, effectiveDate: '2026-02-30' },
    },
    {
      ...validConfig,
      legal: { ...validConfig.legal, governingLaw: 'UNKNOWN' },
    },
  ])('rejects missing, placeholder, or invalid values', (input) => {
    expect(() => parseLegalConfig(input)).toThrow(LegalConfigUnavailableError);
  });
});
