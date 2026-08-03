import 'server-only';

import { readFile } from 'node:fs/promises';

import { runtimeLegalConfigPath } from 'legal-config-path-provider';

import {
  LegalConfigUnavailableError,
  parseLegalConfig,
  type LegalConfig,
} from './legal-config-schema';

export { LegalConfigUnavailableError } from './legal-config-schema';
export type { LegalConfig } from './legal-config-schema';

export async function loadLegalConfig(): Promise<LegalConfig> {
  try {
    const source = await readFile(runtimeLegalConfigPath(), 'utf8');
    return parseLegalConfig(JSON.parse(source) as unknown);
  } catch (error) {
    console.error('[legal-config] LEGAL_CONFIG_UNAVAILABLE');
    if (error instanceof LegalConfigUnavailableError) throw error;
    throw new LegalConfigUnavailableError();
  }
}
