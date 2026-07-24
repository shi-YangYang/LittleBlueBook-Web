import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eRoot, '..');
const composeProject = 'littlebluebook-spec002-e2e';
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker';
const pnpmCli = process.env.npm_execpath;
const pnpmCommand = pnpmCli
  ? process.execPath
  : process.platform === 'win32'
    ? 'pnpm.cmd'
    : 'pnpm';
const pnpmPrefix = pnpmCli ? [pnpmCli] : [];

const postgresPort = 55432;
const redisPort = 56379;
const frontendPort = 3100;
const backendPort = 3101;
const databaseUser = 'littlebluebook_e2e';
const databasePassword = 'littlebluebook-e2e-local';
const databaseName = 'littlebluebook_e2e';
const testCode = '246810';

const databaseUrl =
  `postgresql://${databaseUser}:${databasePassword}` +
  `@127.0.0.1:${postgresPort}/${databaseName}`;
const redisUrl = `redis://127.0.0.1:${redisPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const apiUrl = `http://127.0.0.1:${backendPort}/api/v1`;

const composeEnvironment = {
  ...process.env,
  POSTGRES_USER: databaseUser,
  POSTGRES_PASSWORD: databasePassword,
  POSTGRES_DB: databaseName,
  POSTGRES_PORT: String(postgresPort),
  REDIS_PORT: String(redisPort),
};

const applicationEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(backendPort),
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  FRONTEND_ORIGIN: frontendUrl,
  SWAGGER_ENABLED: 'false',
  TRUST_PROXY_HOPS: '0',
  COOKIE_SECURE: 'false',
  AUTH_CODE_HASH_SECRET:
    'spec-002-e2e-only-hash-secret-at-least-32-characters',
  SMTP_HOST: 'smtp.163.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_FROM_ADDRESS: 'e2e@example.com',
  SMTP_USERNAME: 'e2e@example.com',
  SMTP_AUTH_CODE: 'test-only-memory-transport-placeholder',
  SMTP_FROM_NAME: '小蓝书',
  MAIL_TRANSPORT: 'memory',
  E2E_TEST_CODE: testCode,
};

let backendProcess;
let frontendProcess;
let infrastructureStarted = false;
let cleaningUp = false;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} failed with ` +
            `${signal ? `signal ${signal}` : `exit code ${code}`}`,
        ),
      );
    });
  });
}

function start(command, args, env) {
  return spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
}

function runPnpm(args, options = {}) {
  return run(pnpmCommand, [...pnpmPrefix, ...args], options);
}

function startPnpm(args, env) {
  return start(pnpmCommand, [...pnpmPrefix, ...args], env);
}

async function stop(child) {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await run(
      'taskkill.exe',
      ['/pid', String(child.pid), '/t', '/f'],
      { stdio: 'ignore' },
    ).catch(() => undefined);
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => {
      reject(
        new Error(
          `Required E2E port ${port} is already in use; no process was stopped.`,
        ),
      );
    });
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(resolve);
    });
  });
}

async function waitFor(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function composeArgs(...args) {
  return ['compose', '-p', composeProject, ...args];
}

async function seedUsersAndSessions() {
  const users = [
    [
      '00000000-0000-4000-8000-000000000101',
      'existing-chromium@example.com',
      '铬蓝用户',
    ],
    [
      '00000000-0000-4000-8000-000000000102',
      'existing-firefox@example.com',
      '火狐蓝友',
    ],
    [
      '00000000-0000-4000-8000-000000000103',
      'existing-webkit@example.com',
      '织网蓝友',
    ],
    [
      '00000000-0000-4000-8000-000000000104',
      'multi-device@example.com',
      '多端蓝友',
    ],
  ];
  const values = users
    .map(
      ([id, email, nickname]) =>
        `('${id}', '${email}', '${nickname}', ` +
        'CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    )
    .join(', ');
  const sql =
    'INSERT INTO "users" ' +
    '("id", "email", "nickname", "createdAt", "updatedAt", "lastLoginAt") ' +
    `VALUES ${values} ON CONFLICT ("email") DO NOTHING;`;

  await run(
    dockerCommand,
    composeArgs(
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      databaseUser,
      '-d',
      databaseName,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ),
    { env: composeEnvironment },
  );

  const multiDeviceUserId = users[3][0];
  const sessions = ['spec002-device-a-session', 'spec002-device-b-session'];
  for (const sessionId of sessions) {
    const key =
      'auth:session:' +
      createHash('sha256').update(sessionId).digest('hex');
    const value = JSON.stringify({
      userId: multiDeviceUserId,
      createdAt: new Date().toISOString(),
    });
    await run(
      dockerCommand,
      composeArgs(
        'exec',
        '-T',
        'redis',
        'redis-cli',
        'SET',
        key,
        value,
        'EX',
        String(30 * 24 * 60 * 60),
      ),
      { env: composeEnvironment, stdio: 'ignore' },
    );
  }
}

function findSystemChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  if (process.platform !== 'win32') {
    return undefined;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function availableBrowserFamilies(systemChromiumPath) {
  const { chromium, firefox, webkit } = await import('@playwright/test');
  const availability = {
    chromium:
      Boolean(systemChromiumPath) || existsSync(chromium.executablePath()),
    firefox: existsSync(firefox.executablePath()),
    webkit: existsSync(webkit.executablePath()),
  };
  const available = Object.entries(availability)
    .filter(([, installed]) => installed)
    .map(([name]) => name);
  const unavailable = Object.entries(availability)
    .filter(([, installed]) => !installed)
    .map(([name]) => name);

  if (unavailable.length > 0) {
    console.warn(
      `Playwright browser binaries unavailable for: ${unavailable.join(', ')}. ` +
        'Their configured projects were not run.',
    );
  }
  if (available.length === 0) {
    throw new Error('No installed browser is available for Playwright E2E.');
  }
  return available;
}

async function cleanup() {
  if (cleaningUp) {
    return;
  }
  cleaningUp = true;

  await stop(frontendProcess);
  await stop(backendProcess);

  if (infrastructureStarted) {
    await run(
      dockerCommand,
      composeArgs('down', '--volumes', '--remove-orphans'),
      { env: composeEnvironment },
    ).catch(() => undefined);
  }
}

async function main() {
  await run(
    dockerCommand,
    composeArgs('down', '--remove-orphans'),
    { env: composeEnvironment, stdio: 'ignore' },
  ).catch(() => undefined);

  await Promise.all(
    [postgresPort, redisPort, frontendPort, backendPort].map(assertPortFree),
  );

  infrastructureStarted = true;
  await run(
    dockerCommand,
    composeArgs('up', '-d', '--wait', 'postgres', 'redis'),
    { env: composeEnvironment },
  );

  await runPnpm(['--filter', 'backend', 'db:deploy'], {
    env: applicationEnvironment,
  });
  await seedUsersAndSessions();

  backendProcess = startPnpm(
    ['--filter', 'backend', 'exec', 'tsx', 'src/main.ts'],
    applicationEnvironment,
  );
  await waitFor(`http://127.0.0.1:${backendPort}/health/ready`);

  frontendProcess = startPnpm(
    [
      '--filter',
      'frontend',
      'exec',
      'next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(frontendPort),
    ],
    {
      ...process.env,
      NEXT_PUBLIC_API_URL: apiUrl,
    },
  );
  await waitFor(`${frontendUrl}/healthz`);

  const chromiumPath = findSystemChromium();
  const browserFamilies = await availableBrowserFamilies(chromiumPath);
  const projectArguments = browserFamilies.flatMap((browser) =>
    [1280, 1440, 1920].map(
      (viewport) => `--project=${browser}-${viewport}`,
    ),
  );
  await runPnpm(['exec', 'playwright', 'test', ...projectArguments], {
    cwd: e2eRoot,
    env: {
      ...applicationEnvironment,
      E2E_FRONTEND_URL: frontendUrl,
      E2E_API_URL: apiUrl,
      ...(chromiumPath
        ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: chromiumPath }
        : {}),
    },
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(1));
  });
}

try {
  await main();
} finally {
  await cleanup();
}
