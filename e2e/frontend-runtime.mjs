import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import path from 'node:path';

const excludedTopLevelEntries = new Set([
  '.next',
  '.next-e2e',
  'coverage',
  'node_modules',
  'playwright-report',
  'test-results',
]);

export function shouldCopyFrontendRelativePath(relativePath) {
  if (!relativePath) return true;
  const normalized = relativePath.split(path.sep).join('/');
  const segments = normalized.split('/');
  if (excludedTopLevelEntries.has(segments[0])) return false;
  if (segments.some((segment) => segment.startsWith('.env'))) return false;
  if (normalized.endsWith('.tsbuildinfo')) return false;
  return normalized !== 'config/legal.local.json';
}

export function prepareFrontendRuntime(options) {
  const repositoryRoot = realpathSync(path.resolve(options.repositoryRoot));
  const sourceRoot = realpathSync(path.resolve(repositoryRoot, 'frontend'));
  const repositoryTestRootPath = path.resolve(repositoryRoot, 'test');
  const runtimeRoot = path.resolve(options.runtimeRoot);

  if (
    !runtimeRoot.startsWith(`${repositoryTestRootPath}${path.sep}`) ||
    path.basename(runtimeRoot) !== 'frontend' ||
    runtimeRoot === sourceRoot ||
    existsSync(runtimeRoot)
  ) {
    throw new Error('Refusing to prepare an unsafe frontend runtime.');
  }

  mkdirSync(repositoryTestRootPath, { recursive: true });
  const repositoryTestRoot = realpathSync(repositoryTestRootPath);
  mkdirSync(path.dirname(runtimeRoot), { recursive: true });
  const runtimeParent = realpathSync(path.dirname(runtimeRoot));
  if (!runtimeParent.startsWith(`${repositoryTestRoot}${path.sep}`)) {
    throw new Error('Refusing to prepare an unsafe frontend runtime.');
  }
  cpSync(sourceRoot, runtimeRoot, {
    recursive: true,
    filter(sourcePath) {
      return shouldCopyFrontendRelativePath(
        path.relative(sourceRoot, sourcePath),
      );
    },
  });

  const sourceNodeModules = path.resolve(sourceRoot, 'node_modules');
  const runtimeNodeModules = path.resolve(runtimeRoot, 'node_modules');
  if (!existsSync(sourceNodeModules)) {
    throw new Error('Frontend dependencies are unavailable.');
  }
  symlinkSync(sourceNodeModules, runtimeNodeModules, 'junction');

  if (
    existsSync(path.resolve(runtimeRoot, 'config', 'legal.local.json')) ||
    existsSync(path.resolve(runtimeRoot, '.env')) ||
    existsSync(path.resolve(runtimeRoot, '.env.local'))
  ) {
    throw new Error('Private frontend configuration entered the test runtime.');
  }
}

export function createFrontendRuntime(options) {
  const repositoryRoot = realpathSync(path.resolve(options.repositoryRoot));
  const repositoryTestRoot = realpathSync(path.resolve(repositoryRoot, 'test'));
  const runtimeRoot = realpathSync(path.resolve(options.runtimeRoot));
  const configuredPath = path.resolve(options.legalConfigPath);

  try {
    const taskRoot = path.dirname(runtimeRoot);
    const taskFixtureRoot = realpathSync(path.resolve(taskRoot, 'test'));
    const configEntry = lstatSync(configuredPath);
    const realConfigPath = realpathSync(configuredPath);
    if (
      path.basename(runtimeRoot) !== 'frontend' ||
      !runtimeRoot.startsWith(`${repositoryTestRoot}${path.sep}`) ||
      !configEntry.isFile() ||
      configEntry.isSymbolicLink() ||
      path.basename(realConfigPath) !== 'legal.local.json' ||
      !realConfigPath.startsWith(`${taskFixtureRoot}${path.sep}`)
    ) {
      throw new Error('unsafe');
    }

    const nextBin = path.resolve(
      runtimeRoot,
      'node_modules',
      'next',
      'dist',
      'bin',
      'next',
    );
    if (!existsSync(nextBin)) throw new Error('missing');

    const environment = {
      ...options.environment,
      NODE_ENV: 'development',
      E2E_LEGAL_CONFIG_PATH: realConfigPath,
      NEXT_DIST_DIR: '.next-e2e',
    };
    delete environment.TURBOPACK;

    return {
      command: process.execPath,
      args: [
        nextBin,
        'dev',
        '--webpack',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(options.port),
      ],
      cwd: runtimeRoot,
      env: environment,
    };
  } catch {
    throw new Error('Refusing to start an unsafe frontend E2E runtime.');
  }
}
