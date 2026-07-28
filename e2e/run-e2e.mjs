import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eRoot, '..');
const composeProject = 'littlebluebook-spec004-e2e';
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker';
const pnpmCli = process.env.npm_execpath;
const pnpmCommand = pnpmCli
  ? process.execPath
  : process.platform === 'win32'
    ? 'pnpm.cmd'
    : 'pnpm';
const pnpmPrefix = pnpmCli ? [pnpmCli] : [];
const playwrightArguments = process.argv.slice(2);

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
const repositoryTestRoot = path.resolve(repoRoot, 'test');
const taskTestRoot = path.resolve(repositoryTestRoot, 'spec004-e2e');
const mediaRoot = path.resolve(taskTestRoot, 'media');

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
  AUTH_CODE_HASH_SECRET: 'spec-002-e2e-only-hash-secret-at-least-32-characters',
  SMTP_HOST: 'smtp.163.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_FROM_ADDRESS: 'e2e@example.com',
  SMTP_USERNAME: 'e2e@example.com',
  SMTP_AUTH_CODE: 'test-only-memory-transport-placeholder',
  SMTP_FROM_NAME: '小蓝书',
  MAIL_TRANSPORT: 'memory',
  E2E_TEST_CODE: testCode,
  MEDIA_ROOT: mediaRoot,
  MEDIA_PUBLIC_BASE_URL: `${apiUrl}/media`,
};

let backendProcess;
let frontendProcess;
let infrastructureStarted = false;
let cleaningUp = false;
let frontendGeneratedFileSnapshots;

function removeTaskTestDirectory() {
  if (
    path.dirname(taskTestRoot) !== repositoryTestRoot ||
    !taskTestRoot.startsWith(`${repositoryTestRoot}${path.sep}`)
  ) {
    throw new Error('Refusing to clean an unexpected E2E test directory.');
  }
  if (!existsSync(taskTestRoot)) {
    return;
  }

  const removeEntries = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.resolve(directory, entry.name);
      if (!target.startsWith(`${taskTestRoot}${path.sep}`)) {
        throw new Error('Refusing to clean an unexpected E2E test entry.');
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        removeEntries(target);
        rmdirSync(target);
      } else {
        unlinkSync(target);
      }
    }
  };

  removeEntries(taskTestRoot);
  rmdirSync(taskTestRoot);
}

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
    await run('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    }).catch(() => undefined);
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
      '0000000101',
    ],
    [
      '00000000-0000-4000-8000-000000000102',
      'existing-firefox@example.com',
      '火狐蓝友',
      '0000000102',
    ],
    [
      '00000000-0000-4000-8000-000000000103',
      'existing-webkit@example.com',
      '织网蓝友',
      '0000000103',
    ],
    [
      '00000000-0000-4000-8000-000000000104',
      'multi-device@example.com',
      '多端蓝友',
      '0000000104',
    ],
    [
      '00000000-0000-4000-8000-000000000105',
      'content-author@example.com',
      '内容蓝友',
      '0000000105',
    ],
  ];
  const values = users
    .map(
      ([id, email, nickname, littleBlueBookId]) =>
        `('${id}', '${email}', '${nickname}', '${littleBlueBookId}', ` +
        "'PRIVATE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    )
    .join(', ');
  const sql =
    'INSERT INTO "users" ' +
    '("id", "email", "nickname", "littleBlueBookId", "gender", ' +
    '"createdAt", "updatedAt", "lastLoginAt") ' +
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
  const contentUserId = users[4][0];
  const sessions = [
    ['spec002-device-a-session', multiDeviceUserId],
    ['spec002-device-b-session', multiDeviceUserId],
    ['spec003-profile-session', multiDeviceUserId],
    ['spec003-logout-session', multiDeviceUserId],
    ['spec004-content-session', contentUserId],
  ];
  for (const [sessionId, userId] of sessions) {
    const key =
      'auth:session:' + createHash('sha256').update(sessionId).digest('hex');
    const value = JSON.stringify({
      userId,
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

async function verifyLegacyMigrations() {
  const migrationDatabase = 'littlebluebook_legacy_migration_e2e';
  const baselineSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260724000100_add_users',
      'migration.sql',
    ),
    'utf8',
  );
  const profileSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260726000100_add_user_profiles',
      'migration.sql',
    ),
    'utf8',
  );
  const contentSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260726000200_add_content_notes',
      'migration.sql',
    ),
    'utf8',
  );
  const channelSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260727000100_add_note_channels',
      'migration.sql',
    ),
    'utf8',
  );
  const channelSeedStart = channelSql.indexOf('INSERT INTO "channels"');
  const channelSeedEnd = channelSql.indexOf(
    '-- Add the relation as nullable',
    channelSeedStart,
  );
  if (channelSeedStart < 0 || channelSeedEnd < 0) {
    throw new Error('Unable to locate the idempotent channel seed statement.');
  }
  const channelSeedSql = channelSql.slice(channelSeedStart, channelSeedEnd);
  const psql = (...args) =>
    run(
      dockerCommand,
      composeArgs(
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        databaseUser,
        ...args,
      ),
      { env: composeEnvironment, stdio: 'ignore' },
    );

  await psql('-d', databaseName, '-c', `CREATE DATABASE ${migrationDatabase};`);
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    baselineSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO "users" ` +
      '("id", "email", "nickname", "createdAt", "updatedAt", "lastLoginAt") ' +
      "VALUES ('00000000-0000-4000-8000-000000000099', " +
      "'legacy@example.com', '旧蓝友', CURRENT_TIMESTAMP, " +
      'CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);',
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    profileSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    contentSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO "notes"
      ("id", "authorId", "title", "content", "clientRequestId",
       "createdAt", "updatedAt")
    VALUES
      ('00000000-0000-4000-8000-000000000098',
       '00000000-0000-4000-8000-000000000099',
       '迁移前标题', '迁移前正文',
       '00000000-0000-4000-8000-000000000097',
       '2026-07-26T00:00:00.000Z', '2026-07-26T00:00:00.000Z');`,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    channelSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    channelSeedSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "users"
        WHERE "email" = 'legacy@example.com'
          AND "littleBlueBookId" ~ '^[0-9]{10}$'
          AND "gender" = 'PRIVATE'
      ) THEN
        RAISE EXCEPTION 'SPEC-003 legacy profile backfill failed';
      END IF;
      IF (SELECT count(*) FROM "channels"
          WHERE "isPublic" AND "enabled" AND "publishable") <> 13 THEN
        RAISE EXCEPTION 'SPEC-006 public channel seed failed';
      END IF;
      IF (SELECT count(*) FROM "channels") <> 14 THEN
        RAISE EXCEPTION 'SPEC-006 channel seed is not idempotent';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM "notes" n
        JOIN "channels" c ON c."id" = n."channelId"
        WHERE n."id" = '00000000-0000-4000-8000-000000000098'
          AND n."title" = '迁移前标题'
          AND n."content" = '迁移前正文'
          AND n."createdAt" = '2026-07-26T00:00:00.000Z'
          AND c."code" = 'uncategorized'
          AND NOT c."isPublic"
          AND NOT c."publishable"
      ) THEN
        RAISE EXCEPTION 'SPEC-006 legacy note backfill failed';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'notes'
          AND indexname = 'notes_channelId_createdAt_id_idx'
      ) THEN
        RAISE EXCEPTION 'SPEC-006 channel cursor index missing';
      END IF;
    END $$;`,
  );
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
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function availableBrowserFamilies(systemChromiumPath) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
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

  if (frontendGeneratedFileSnapshots) {
    for (const [filePath, contents] of frontendGeneratedFileSnapshots) {
      writeFileSync(filePath, contents);
    }
    frontendGeneratedFileSnapshots = undefined;
  }

  if (infrastructureStarted) {
    await run(
      dockerCommand,
      composeArgs('down', '--volumes', '--remove-orphans'),
      { env: composeEnvironment },
    ).catch(() => undefined);
  }

  removeTaskTestDirectory();
  if (existsSync(taskTestRoot)) {
    throw new Error('E2E test media directory cleanup did not complete.');
  }
}

async function main() {
  removeTaskTestDirectory();
  if (existsSync(taskTestRoot)) {
    throw new Error('Unable to prepare a clean E2E test directory.');
  }
  mkdirSync(mediaRoot, { recursive: true });

  await run(dockerCommand, composeArgs('down', '--remove-orphans'), {
    env: composeEnvironment,
    stdio: 'ignore',
  }).catch(() => undefined);

  await Promise.all(
    [postgresPort, redisPort, frontendPort, backendPort].map(assertPortFree),
  );

  infrastructureStarted = true;
  await run(
    dockerCommand,
    composeArgs('up', '-d', '--wait', 'postgres', 'redis'),
    { env: composeEnvironment },
  );

  await verifyLegacyMigrations();
  await runPnpm(['--filter', 'backend', 'db:deploy'], {
    env: applicationEnvironment,
  });
  await seedUsersAndSessions();

  backendProcess = startPnpm(
    ['--filter', 'backend', 'exec', 'tsx', 'src/main.ts'],
    applicationEnvironment,
  );
  await waitFor(`http://127.0.0.1:${backendPort}/health/ready`);

  frontendGeneratedFileSnapshots = [
    path.join(repoRoot, 'frontend', 'next-env.d.ts'),
    path.join(repoRoot, 'frontend', 'tsconfig.json'),
  ].map((filePath) => [filePath, readFileSync(filePath)]);
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
      NEXT_DIST_DIR: '.next-e2e',
    },
  );
  await waitFor(`${frontendUrl}/healthz`);

  const chromiumPath = findSystemChromium();
  const browserFamilies = await availableBrowserFamilies(chromiumPath);
  const projectArguments = browserFamilies.flatMap((browser) =>
    [1280, 1440, 1920].map((viewport) => `--project=${browser}-${viewport}`),
  );
  const selectedProjectArguments = playwrightArguments.some((argument) =>
    argument.startsWith('--project'),
  )
    ? []
    : projectArguments;
  await runPnpm(
    [
      'exec',
      'playwright',
      'test',
      ...selectedProjectArguments,
      ...playwrightArguments,
    ],
    {
      cwd: e2eRoot,
      env: {
        ...applicationEnvironment,
        E2E_FRONTEND_URL: frontendUrl,
        E2E_API_URL: apiUrl,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0',
        ...(chromiumPath
          ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: chromiumPath }
          : {}),
      },
    },
  );
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
