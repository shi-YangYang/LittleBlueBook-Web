import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

export class LegalConfigPathUnavailableError extends Error {
  constructor() {
    super('LEGAL_CONFIG_PATH_UNAVAILABLE');
    this.name = 'LegalConfigPathUnavailableError';
  }
}

export function repositoryRootFromCwd(cwd: string): string {
  const resolvedCwd = path.resolve(cwd);
  return path.basename(resolvedCwd) === 'frontend'
    ? path.resolve(resolvedCwd, '..')
    : resolvedCwd;
}

export function resolveControlledE2ELegalConfigPath(options: {
  configuredPath: string | undefined;
  nodeEnv: string | undefined;
  repositoryRoot: string;
}): string | undefined {
  const { configuredPath, nodeEnv } = options;
  if (!configuredPath) return undefined;
  if (nodeEnv === 'production') {
    throw new LegalConfigPathUnavailableError();
  }

  const repositoryRoot = path.resolve(options.repositoryRoot);
  const testRoot = path.resolve(repositoryRoot, 'test');
  const resolvedPath = path.resolve(configuredPath);
  if (
    path.basename(resolvedPath) !== 'legal.local.json' ||
    !resolvedPath.startsWith(`${testRoot}${path.sep}`)
  ) {
    throw new LegalConfigPathUnavailableError();
  }

  try {
    const file = lstatSync(resolvedPath);
    const realTestRoot = realpathSync(testRoot);
    const realConfigPath = realpathSync(resolvedPath);
    if (
      !file.isFile() ||
      file.isSymbolicLink() ||
      !realConfigPath.startsWith(`${realTestRoot}${path.sep}`)
    ) {
      throw new LegalConfigPathUnavailableError();
    }
    return realConfigPath;
  } catch (error) {
    if (error instanceof LegalConfigPathUnavailableError) throw error;
    throw new LegalConfigPathUnavailableError();
  }
}
