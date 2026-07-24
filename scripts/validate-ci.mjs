import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

const workflowPath = new URL('../.github/workflows/ci.yml', import.meta.url);
const workflowText = await readFile(workflowPath, 'utf8');
const workflow = parse(workflowText);

const fail = (message) => {
  throw new Error(`Invalid CI workflow: ${message}`);
};

const triggers =
  workflow.on && typeof workflow.on === 'object'
    ? Object.keys(workflow.on)
    : [];

if (
  triggers.length !== 1 ||
  triggers[0] !== 'workflow_dispatch' ||
  Object.hasOwn(workflow.on, 'push') ||
  Object.hasOwn(workflow.on, 'pull_request')
) {
  fail(
    'workflow_dispatch must be the only trigger; push and pull_request are forbidden',
  );
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

if (/docker\s+(push|login)|\bssh\b/i.test(workflowText)) {
  fail('CI must not publish images, deploy, or connect to production');
}

console.log('CI workflow static validation passed.');
