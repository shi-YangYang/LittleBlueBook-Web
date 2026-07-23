import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

const workflowPath = new URL('../.github/workflows/ci.yml', import.meta.url);
const workflowText = await readFile(workflowPath, 'utf8');
const workflow = parse(workflowText);

const fail = (message) => {
  throw new Error(`Invalid CI workflow: ${message}`);
};

if (
  !workflow.on ||
  !Object.hasOwn(workflow.on, 'pull_request') ||
  !workflow.on.push?.branches?.includes('main')
) {
  fail('Pull Request and main push triggers are required');
}

if (workflow.permissions?.contents !== 'read') {
  fail('top-level contents permission must be read-only');
}

const serialized = JSON.stringify(workflow);

for (const requiredCommand of [
  'pnpm install --frozen-lockfile',
  'pnpm format:check',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm test:e2e',
  'pnpm build',
  'pnpm docker:build',
]) {
  if (!serialized.includes(requiredCommand)) {
    fail(`missing command: ${requiredCommand}`);
  }
}

for (const match of workflowText.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/g)) {
  const [, action, reference] = match;

  if (!/^[0-9a-f]{40}$/.test(reference)) {
    fail(`${action} is not pinned to an immutable commit SHA`);
  }
}

if (/docker\s+(push|login)|workflow_dispatch|ssh/i.test(workflowText)) {
  fail('CI must not publish images, deploy, or connect to production');
}

console.log('CI workflow static validation passed.');
