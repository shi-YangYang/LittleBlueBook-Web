import { existsSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const nextRoot = path.resolve(frontendRoot, '.next');
const staleDevelopmentOutput = path.resolve(nextRoot, 'dev');

if (
  path.dirname(staleDevelopmentOutput) !== nextRoot ||
  !staleDevelopmentOutput.startsWith(`${nextRoot}${path.sep}`)
) {
  throw new Error('Refusing to clean an unexpected Next.js directory.');
}

function removeEntries(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.resolve(directory, entry.name);
    if (!target.startsWith(`${staleDevelopmentOutput}${path.sep}`)) {
      throw new Error('Refusing to clean an unexpected Next.js entry.');
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      removeEntries(target);
      rmdirSync(target);
    } else {
      unlinkSync(target);
    }
  }
}

if (existsSync(staleDevelopmentOutput)) {
  removeEntries(staleDevelopmentOutput);
  rmdirSync(staleDevelopmentOutput);
}
