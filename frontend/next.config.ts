import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const projectDirectory = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(projectDirectory, '..'),
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
