import 'server-only';

import path from 'node:path';

import { repositoryRootFromCwd } from './legal-config-path-policy';

export function runtimeLegalConfigPath(): string {
  return path.join(
    repositoryRootFromCwd(process.cwd()),
    'frontend',
    'config',
    'legal.local.json',
  );
}
