import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

import { resolveControlledE2ELegalConfigPath } from './config/legal-config-path-policy';

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(projectDirectory, '..');
const controlledE2EConfigPath = resolveControlledE2ELegalConfigPath({
  configuredPath: process.env.E2E_LEGAL_CONFIG_PATH,
  nodeEnv: process.env.NODE_ENV,
  repositoryRoot,
});
const legalConfigPathProvider = controlledE2EConfigPath
  ? './config/legal-config-path.e2e.ts'
  : './config/legal-config-path.default.ts';

if (controlledE2EConfigPath && process.env.TURBOPACK) {
  throw new Error('E2E_LEGAL_CONFIG_REQUIRES_WEBPACK');
}

const controlledWebpackConfig: Pick<NextConfig, 'webpack'> =
  controlledE2EConfigPath
    ? {
        webpack(config) {
          config.resolve.alias = {
            ...config.resolve.alias,
            'legal-config-path-provider': resolve(
              projectDirectory,
              legalConfigPathProvider,
            ),
          };
          return config;
        },
      }
    : {};

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repositoryRoot,
  outputFileTracingExcludes: {
    '*': ['config/legal.local.json'],
  },
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  turbopack: {
    root: repositoryRoot,
    resolveAlias: {
      'legal-config-path-provider': './config/legal-config-path.default.ts',
    },
  },
  ...controlledWebpackConfig,
};

export default nextConfig;
