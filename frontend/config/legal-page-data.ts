import 'server-only';

import { loadLegalConfig, type LegalConfig } from './legal-config';

type LegalVersions = {
  termsVersion: string;
  privacyVersion: string;
};

export type LegalPageData = {
  config: LegalConfig;
  versions: LegalVersions;
};

export async function loadLegalPageData(): Promise<LegalPageData> {
  const config = await loadLegalConfig();
  const backendOrigin = (
    process.env.BACKEND_URL ?? 'http://127.0.0.1:3001'
  ).replace(/\/$/, '');
  const response = await fetch(`${backendOrigin}/api/v1/auth/legal-status`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('LEGAL_STATUS_UNAVAILABLE');
  const payload = (await response.json()) as {
    data?: Partial<LegalVersions>;
  };
  const termsVersion = payload.data?.termsVersion;
  const privacyVersion = payload.data?.privacyVersion;
  if (!termsVersion || !privacyVersion) {
    throw new Error('LEGAL_STATUS_UNAVAILABLE');
  }
  return { config, versions: { termsVersion, privacyVersion } };
}
