import { mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LegalConfigPathUnavailableError,
  repositoryRootFromCwd,
  resolveControlledE2ELegalConfigPath,
} from './legal-config-path-policy';

const repositoryRoot = repositoryRootFromCwd(process.cwd());
const taskRoot = path.resolve(
  repositoryRoot,
  'test',
  'spec-012-legal-config-policy-unit',
);
const controlledConfigPath = path.resolve(
  taskRoot,
  'legal-config',
  'legal.local.json',
);

describe('controlled E2E legal configuration path', () => {
  beforeAll(() => {
    mkdirSync(path.dirname(controlledConfigPath), { recursive: true });
    writeFileSync(controlledConfigPath, '{}', { encoding: 'utf8', flag: 'wx' });
  });

  afterAll(() => {
    unlinkSync(controlledConfigPath);
    rmdirSync(path.dirname(controlledConfigPath));
    rmdirSync(taskRoot);
  });

  it('accepts an existing regular file inside the repository test root', () => {
    expect(
      resolveControlledE2ELegalConfigPath({
        configuredPath: controlledConfigPath,
        nodeEnv: 'test',
        repositoryRoot,
      }),
    ).toBe(controlledConfigPath);
  });

  it('does not activate an override when none was provided', () => {
    expect(
      resolveControlledE2ELegalConfigPath({
        configuredPath: undefined,
        nodeEnv: 'test',
        repositoryRoot,
      }),
    ).toBeUndefined();
  });

  it.each([
    {
      configuredPath: controlledConfigPath,
      nodeEnv: 'production',
    },
    {
      configuredPath: path.resolve(
        repositoryRoot,
        'frontend',
        'config',
        'legal.local.json',
      ),
      nodeEnv: 'test',
    },
    {
      configuredPath: path.resolve(taskRoot, 'legal-config', 'other.json'),
      nodeEnv: 'test',
    },
  ])('rejects an unsafe or production override', (input) => {
    expect(() =>
      resolveControlledE2ELegalConfigPath({
        ...input,
        repositoryRoot,
      }),
    ).toThrow(LegalConfigPathUnavailableError);
  });
});
