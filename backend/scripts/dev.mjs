/* global console, process */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRequire = createRequire(import.meta.url);
const tscCli = runtimeRequire.resolve('typescript/bin/tsc');
const children = new Set();
let shuttingDown = false;

function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: backendRoot,
    env: process.env,
    stdio: 'inherit',
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function waitForExit(child) {
  return new Promise((resolveExit) => {
    child.once('exit', (code, signal) => {
      resolveExit({ code: code ?? 1, signal });
    });
  });
}

function stopChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChildren(signal);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

const initialBuild = start([tscCli, '--project', 'tsconfig.build.json']);
const initialResult = await waitForExit(initialBuild);
if (initialResult.code !== 0) {
  process.exitCode = initialResult.code;
} else if (!shuttingDown) {
  const compiler = start([
    tscCli,
    '--project',
    'tsconfig.build.json',
    '--watch',
    '--preserveWatchOutput',
  ]);
  const application = start([
    '--watch',
    '--enable-source-maps',
    'dist/main.js',
  ]);

  const handleUnexpectedExit = (name, peer) => (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!peer.killed) peer.kill('SIGTERM');
    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
    console.error(`[backend:dev] ${name} stopped with ${reason}.`);
    process.exitCode = code ?? 1;
  };

  compiler.once(
    'exit',
    handleUnexpectedExit('TypeScript compiler', application),
  );
  application.once('exit', handleUnexpectedExit('Node watcher', compiler));
}
