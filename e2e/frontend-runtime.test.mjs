import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  createFrontendRuntime,
  prepareFrontendRuntime,
  shouldCopyFrontendRelativePath,
} from './frontend-runtime.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const taskRoot = path.resolve(
  repositoryRoot,
  'test',
  'spec-012-frontend-runtime-unit',
);
const runtimeRoot = path.resolve(taskRoot, 'frontend');
const configPath = path.resolve(
  taskRoot,
  'test',
  'legal-config',
  'legal.local.json',
);

function removeEntries(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (entry.name === 'node_modules') rmdirSync(target);
      else unlinkSync(target);
    } else if (entry.isDirectory()) {
      removeEntries(target);
      rmdirSync(target);
    } else {
      unlinkSync(target);
    }
  }
}

test('excludes private configuration and generated frontend state', () => {
  for (const relativePath of [
    'config/legal.local.json',
    '.env',
    '.env.local',
    path.join('nested', '.env.test'),
    path.join('node_modules', 'next', 'package.json'),
    path.join('.next-e2e', 'dev', 'cache.sst'),
    path.join('.next', 'server', 'app.js'),
    path.join('coverage', 'index.html'),
    'tsconfig.tsbuildinfo',
  ]) {
    assert.equal(shouldCopyFrontendRelativePath(relativePath), false);
  }
});

test('prepares an isolated webpack runtime with linked dependencies', () => {
  removeEntries(taskRoot);
  if (existsSync(taskRoot)) rmdirSync(taskRoot);
  prepareFrontendRuntime({ repositoryRoot, runtimeRoot });
  try {
    assert.equal(
      existsSync(path.resolve(runtimeRoot, 'config', 'legal.local.json')),
      false,
    );
    assert.equal(existsSync(path.resolve(runtimeRoot, '.env.local')), false);
    assert.equal(
      existsSync(path.resolve(runtimeRoot, 'config', 'legal-config.ts')),
      true,
    );
    assert.equal(existsSync(path.resolve(runtimeRoot, 'node_modules')), true);

    const configDirectory = path.dirname(configPath);
    mkdirSync(configDirectory, { recursive: true });
    writeFileSync(configPath, '{}', { encoding: 'utf8', flag: 'wx' });

    const runtime = createFrontendRuntime({
      repositoryRoot,
      runtimeRoot,
      legalConfigPath: configPath,
      port: 3100,
      environment: { SENTINEL: 'preserved', TURBOPACK: '1' },
    });
    assert.equal(runtime.cwd, runtimeRoot);
    assert.deepEqual(runtime.args.slice(1, 3), ['dev', '--webpack']);
    assert.equal(runtime.env.E2E_LEGAL_CONFIG_PATH, configPath);
    assert.equal(runtime.env.SENTINEL, 'preserved');
    assert.equal(runtime.env.NODE_ENV, 'development');
    assert.equal('TURBOPACK' in runtime.env, false);
    assert.equal('E2E_TURBOPACK_ROOT' in runtime.env, false);
  } finally {
    removeEntries(taskRoot);
    rmdirSync(taskRoot);
  }
});

test('rejects a runtime outside the repository test root', () => {
  assert.throws(
    () =>
      createFrontendRuntime({
        repositoryRoot,
        runtimeRoot: path.resolve(repositoryRoot, 'frontend'),
        legalConfigPath: configPath,
        port: 3100,
        environment: {},
      }),
    /unsafe frontend E2E runtime/,
  );
});
