import 'server-only';

import {
  LegalConfigPathUnavailableError,
  repositoryRootFromCwd,
  resolveControlledE2ELegalConfigPath,
} from './legal-config-path-policy';

export function runtimeLegalConfigPath(): string {
  const controlledPath = resolveControlledE2ELegalConfigPath({
    configuredPath: process.env.E2E_LEGAL_CONFIG_PATH,
    nodeEnv: process.env.NODE_ENV,
    repositoryRoot: repositoryRootFromCwd(process.cwd()),
  });
  if (!controlledPath) throw new LegalConfigPathUnavailableError();
  return controlledPath;
}
