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

import {
  createFrontendRuntime,
  prepareFrontendRuntime,
} from './frontend-runtime.mjs';

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

function configuredPort(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }
  return value;
}

const postgresPort = configuredPort('E2E_POSTGRES_PORT', 55432);
const redisPort = configuredPort('E2E_REDIS_PORT', 56379);
const frontendPort = configuredPort('E2E_FRONTEND_PORT', 3100);
const backendPort = configuredPort('E2E_BACKEND_PORT', 3101);
const databaseUser = 'littlebluebook_e2e';
const databasePassword = 'littlebluebook-e2e-local';
const databaseName = 'littlebluebook_e2e';
const testCode = '246810';
const termsVersion = 'terms-2026-08-03-v1';
const privacyVersion = 'privacy-2026-08-03-v1';

const databaseUrl =
  `postgresql://${databaseUser}:${databasePassword}` +
  `@127.0.0.1:${postgresPort}/${databaseName}`;
const redisUrl = `redis://127.0.0.1:${redisPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const apiUrl = `http://127.0.0.1:${backendPort}/api/v1`;
const repositoryTestRoot = path.resolve(repoRoot, 'test');
const taskDirectoryName = process.env.E2E_TASK_DIRECTORY ?? 'browser-e2e-local';
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(taskDirectoryName)) {
  throw new Error('E2E_TASK_DIRECTORY must be a safe relative directory name.');
}
const taskTestRoot = path.resolve(repositoryTestRoot, taskDirectoryName);
const mediaRoot = path.resolve(taskTestRoot, 'media');
const testFrontendRoot = path.resolve(taskTestRoot, 'frontend');
const testLegalConfigPath = path.resolve(
  taskTestRoot,
  'test',
  'legal-config',
  'legal.local.json',
);

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
  E2E_LEGAL_CONFIG_PATH: testLegalConfigPath,
  MEDIA_ROOT: mediaRoot,
  MEDIA_PUBLIC_BASE_URL: `${apiUrl}/media`,
};

let backendProcess;
let frontendProcess;
let infrastructureStarted = false;
let cleaningUp = false;

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

function start(command, args, env, cwd = repoRoot) {
  return spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
}

function runPnpm(args, options = {}) {
  return run(pnpmCommand, [...pnpmPrefix, ...args], options);
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
    [
      '00000000-0000-4000-8000-000000000106',
      'social-author@example.com',
      '互动作者',
      '0000000106',
    ],
    [
      '00000000-0000-4000-8000-000000000107',
      'social-viewer@example.com',
      '互动蓝友',
      '0000000107',
    ],
    [
      '00000000-0000-4000-8000-000000000108',
      'social-third@example.com',
      '互动访客',
      '0000000108',
    ],
    [
      '00000000-0000-4000-8000-000000000109',
      'search-viewer@example.com',
      '搜索蓝友',
      '0000000109',
    ],
    [
      '00000000-0000-4000-8000-000000000110',
      'search-author@example.com',
      '搜索作者',
      '0000000110',
    ],
    [
      '00000000-0000-4000-8000-000000000111',
      'notification-author@example.com',
      '通知作者',
      '0000000111',
    ],
    [
      '00000000-0000-4000-8000-000000000112',
      'notification-viewer@example.com',
      '通知蓝友',
      '0000000112',
    ],
    [
      '00000000-0000-4000-8000-000000000113',
      'notification-firefox-author@example.com',
      '火狐通知作者',
      '0000000113',
    ],
    [
      '00000000-0000-4000-8000-000000000114',
      'notification-firefox-viewer@example.com',
      '火狐通知蓝友',
      '0000000114',
    ],
    [
      '00000000-0000-4000-8000-000000000115',
      'notification-webkit-author@example.com',
      '织网通知作者',
      '0000000115',
    ],
    [
      '00000000-0000-4000-8000-000000000116',
      'notification-webkit-viewer@example.com',
      '织网通知蓝友',
      '0000000116',
    ],
    [
      '00000000-0000-4000-8000-000000000117',
      'profile-settings-chromium@example.com',
      '资料蓝友',
      '0000000117',
    ],
    [
      '00000000-0000-4000-8000-000000000118',
      'profile-settings-firefox@example.com',
      '火狐资料蓝友',
      '0000000118',
    ],
    [
      '00000000-0000-4000-8000-000000000119',
      'profile-settings-webkit@example.com',
      '织网资料蓝友',
      '0000000119',
    ],
    [
      '00000000-0000-4000-8000-000000000120',
      'engagement-author@example.com',
      '进阶互动作者',
      '0000000120',
    ],
    [
      '00000000-0000-4000-8000-000000000121',
      'engagement-commenter@example.com',
      '进阶互动蓝友',
      '0000000121',
    ],
    [
      '00000000-0000-4000-8000-000000000122',
      'engagement-peer@example.com',
      '私信蓝友',
      '0000000122',
    ],
    [
      '00000000-0000-4000-8000-000000000123',
      'legal-pending@example.com',
      '条款待确认',
      '0000000123',
    ],
    [
      '00000000-0000-4000-8000-000000000124',
      'legal-concurrent@example.com',
      '条款并发蓝友',
      '0000000124',
    ],
    [
      '00000000-0000-4000-8000-000000000125',
      'age-restricted@example.com',
      '年龄受限蓝友',
      '0000000125',
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
      `UPDATE "users" SET "ageRestrictedAt" = CURRENT_TIMESTAMP ` +
        `WHERE "email" = 'age-restricted@example.com';`,
    ),
    { env: composeEnvironment, stdio: 'ignore' },
  );

  const acceptanceValues = users
    .filter(
      ([, email]) =>
        email !== 'legal-pending@example.com' &&
        email !== 'legal-concurrent@example.com',
    )
    .map(
      ([userId], index) =>
        `('10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}', ` +
        `'${userId}', '${termsVersion}', '${privacyVersion}', 'LOGIN', ` +
        `'e2e-seed:${userId}', CURRENT_TIMESTAMP)`,
    )
    .join(', ');
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
      'INSERT INTO "legal_acceptances" ' +
        '("id", "userId", "termsVersion", "privacyVersion", "scene", ' +
        '"evidenceKey", "acceptedAt") ' +
        `VALUES ${acceptanceValues} ON CONFLICT ("evidenceKey") DO NOTHING;`,
    ),
    { env: composeEnvironment },
  );

  const multiDeviceUserId = users[3][0];
  const contentUserId = users[4][0];
  const socialAuthorUserId = users[5][0];
  const socialViewerUserId = users[6][0];
  const socialThirdUserId = users[7][0];
  const searchViewerUserId = users[8][0];
  const searchAuthorUserId = users[9][0];
  const notificationAuthorUserId = users[10][0];
  const notificationViewerUserId = users[11][0];
  const notificationFirefoxAuthorUserId = users[12][0];
  const notificationFirefoxViewerUserId = users[13][0];
  const notificationWebkitAuthorUserId = users[14][0];
  const notificationWebkitViewerUserId = users[15][0];
  const profileSettingsChromiumUserId = users[16][0];
  const profileSettingsFirefoxUserId = users[17][0];
  const profileSettingsWebkitUserId = users[18][0];
  const engagementAuthorUserId = users[19][0];
  const engagementCommenterUserId = users[20][0];
  const engagementPeerUserId = users[21][0];
  const concurrentLegalUserId = users[23][0];
  const sessions = [
    ['spec002-device-a-session', multiDeviceUserId],
    ['spec002-device-b-session', multiDeviceUserId],
    ['spec003-profile-session', multiDeviceUserId],
    ['spec003-logout-session', multiDeviceUserId],
    ['spec004-content-session', contentUserId],
    ['spec007-viewer-session', socialViewerUserId],
    ['spec007-author-session', socialAuthorUserId],
    ['spec007-third-session', socialThirdUserId],
    ['spec008-viewer-session', searchViewerUserId],
    ['spec008-author-session', searchAuthorUserId],
    ['spec009-author-session', notificationAuthorUserId],
    ['spec009-viewer-session', notificationViewerUserId],
    ['spec009-firefox-author-session', notificationFirefoxAuthorUserId],
    ['spec009-firefox-viewer-session', notificationFirefoxViewerUserId],
    ['spec009-webkit-author-session', notificationWebkitAuthorUserId],
    ['spec009-webkit-viewer-session', notificationWebkitViewerUserId],
    ['spec010-chromium-session', profileSettingsChromiumUserId],
    ['spec010-firefox-session', profileSettingsFirefoxUserId],
    ['spec010-webkit-session', profileSettingsWebkitUserId],
    ['spec011-author-session', engagementAuthorUserId],
    ['spec011-commenter-session', engagementCommenterUserId],
    ['spec011-peer-session', engagementPeerUserId],
    ['spec012-pending-session', users[22][0]],
    ['spec012-concurrent-a-session', concurrentLegalUserId],
    ['spec012-concurrent-b-session', concurrentLegalUserId],
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
  const socialSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260728000100_add_social_interactions',
      'migration.sql',
    ),
    'utf8',
  );
  const searchSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260728000200_add_content_search',
      'migration.sql',
    ),
    'utf8',
  );
  const notificationSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260729000100_add_interaction_notifications',
      'migration.sql',
    ),
    'utf8',
  );
  const profileSettingsSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260729000200_add_profile_settings',
      'migration.sql',
    ),
    'utf8',
  );
  const engagementSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260801000100_add_engagement_and_messaging',
      'migration.sql',
    ),
    'utf8',
  );
  const commentReplyChainSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260802000100_preserve_comment_reply_chains',
      'migration.sql',
    ),
    'utf8',
  );
  const legalAcceptanceSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260803000100_add_legal_acceptance',
      'migration.sql',
    ),
    'utf8',
  );
  const legalIdempotencySql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260803000200_enforce_legal_acceptance_idempotency',
      'migration.sql',
    ),
    'utf8',
  );
  const videoNotesSql = readFileSync(
    path.join(
      repoRoot,
      'backend',
      'prisma',
      'migrations',
      '20260803000300_add_video_notes',
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
  await psql('-d', migrationDatabase, '-v', 'ON_ERROR_STOP=1', '-c', socialSql);
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO "note_favorites" ("userId", "noteId", "createdAt")
     VALUES (
       '00000000-0000-4000-8000-000000000099',
       '00000000-0000-4000-8000-000000000098',
       '2026-07-28T00:00:00.000Z'
     );
     INSERT INTO "note_comments"
       ("id", "noteId", "authorId", "content", "createdAt")
     VALUES (
       '00000000-0000-4000-8000-000000000096',
       '00000000-0000-4000-8000-000000000098',
       '00000000-0000-4000-8000-000000000099',
       '迁移前评论',
       '2026-07-28T00:00:00.000Z'
     );`,
  );
  await psql('-d', migrationDatabase, '-v', 'ON_ERROR_STOP=1', '-c', searchSql);
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    notificationSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    profileSettingsSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    engagementSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    commentReplyChainSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    legalAcceptanceSql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO "legal_acceptances"
      ("id", "userId", "termsVersion", "privacyVersion", "scene",
       "evidenceKey", "acceptedAt")
    VALUES
      ('20000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000099',
       '${termsVersion}', '${privacyVersion}', 'RECONFIRMATION',
       'legacy-acceptance-early', '2026-08-01T00:00:00.000Z'),
      ('20000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000099',
       '${termsVersion}', '${privacyVersion}', 'RECONFIRMATION',
       'legacy-acceptance-late', '2026-08-02T00:00:00.000Z');`,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    legalIdempotencySql,
  );
  await psql(
    '-d',
    migrationDatabase,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    videoNotesSql,
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
      IF (SELECT count(*) FROM "notes"
          WHERE "id" = '00000000-0000-4000-8000-000000000098') <> 1 THEN
        RAISE EXCEPTION 'SPEC-007 migration changed a legacy note';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "notes"
        WHERE "id" = '00000000-0000-4000-8000-000000000098'
          AND "contentType" = 'IMAGE'
      ) OR (SELECT count(*) FROM "note_videos") <> 0 THEN
        RAISE EXCEPTION 'SPEC-013 legacy image-note backfill failed';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'notes'
          AND indexname = 'notes_contentType_createdAt_id_idx'
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'note_videos_durationMs_check'
      ) THEN
        RAISE EXCEPTION 'SPEC-013 video constraints or indexes missing';
      END IF;
      IF (SELECT count(*) FROM "note_likes") <> 0
         OR (SELECT count(*) FROM "note_favorites") <> 1
         OR (SELECT count(*) FROM "note_comments") <> 1
         OR (SELECT count(*) FROM "user_follows") <> 0 THEN
        RAISE EXCEPTION 'SPEC-009 migration changed historical interactions';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_follows_no_self_check'
      ) THEN
        RAISE EXCEPTION 'SPEC-007 self-follow constraint missing';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'note_comments'
          AND indexname = 'note_comments_noteId_createdAt_id_idx'
      ) THEN
        RAISE EXCEPTION 'SPEC-007 comment cursor index missing';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
      ) THEN
        RAISE EXCEPTION 'SPEC-008 pg_trgm extension missing';
      END IF;
      IF (
        SELECT count(*) FROM pg_indexes
        WHERE indexname IN (
          'notes_title_trgm_idx',
          'notes_content_trgm_idx',
          'users_nickname_trgm_idx',
          'users_littleBlueBookId_trgm_idx'
        )
      ) <> 4 THEN
        RAISE EXCEPTION 'SPEC-008 trigram indexes missing';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "notes"
        WHERE "id" = '00000000-0000-4000-8000-000000000098'
          AND "title" = '迁移前标题'
          AND "content" = '迁移前正文'
      ) THEN
        RAISE EXCEPTION 'SPEC-008 migration changed legacy content';
      END IF;
      IF (SELECT count(*) FROM "notifications") <> 0 THEN
        RAISE EXCEPTION 'SPEC-009 backfilled historical notifications';
      END IF;
      IF (
        SELECT count(*) FROM pg_indexes
        WHERE indexname IN (
          'notifications_recipientId_createdAt_id_idx',
          'notifications_recipientId_type_createdAt_id_idx',
          'notifications_recipientId_readAt_idx'
        )
      ) <> 3 THEN
        RAISE EXCEPTION 'SPEC-009 notification indexes missing';
      END IF;
      IF (
        SELECT count(*) FROM pg_constraint
        WHERE conname IN (
          'notifications_recipientId_fkey',
          'notifications_actorId_fkey',
          'notifications_noteId_fkey',
          'notifications_commentId_fkey'
        )
      ) <> 4 THEN
        RAISE EXCEPTION 'SPEC-009 notification foreign keys missing';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "users"
        WHERE "email" = 'legacy@example.com'
          AND "birthDate" IS NULL
          AND NOT "showAge"
          AND "bio" IS NULL
          AND "avatarObjectKey" IS NULL
          AND "profileVersion" IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'SPEC-010 legacy profile defaults failed';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'avatar_cleanup_nextAttemptAt_idx'
      ) THEN
        RAISE EXCEPTION 'SPEC-010 cleanup retry index missing';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "notes"
        WHERE "id" = '00000000-0000-4000-8000-000000000098'
          AND "viewCount" = 0
      ) OR NOT EXISTS (
        SELECT 1 FROM "note_comments"
        WHERE "id" = '00000000-0000-4000-8000-000000000096'
          AND "rootCommentId" IS NULL
          AND "replyToId" IS NULL
          AND "replyToAuthorId" IS NULL
          AND "deletedAt" IS NULL
          AND "content" = '迁移前评论'
      ) THEN
        RAISE EXCEPTION 'SPEC-011 legacy engagement backfill failed';
      END IF;
      IF (SELECT count(*) FROM "comment_likes") <> 0
         OR (SELECT count(*) FROM "note_view_subjects") <> 0
         OR (SELECT count(*) FROM "direct_conversations") <> 0
         OR (SELECT count(*) FROM "direct_messages") <> 0 THEN
        RAISE EXCEPTION 'SPEC-011 unexpectedly backfilled new records';
      END IF;
      IF (
        SELECT count(*) FROM pg_indexes
        WHERE indexname IN (
          'note_comments_rootCommentId_createdAt_id_idx',
          'comment_likes_commentId_idx',
          'note_view_subjects_lastViewedAt_idx',
          'direct_conversations_firstParticipantId_lastMessageAt_id_idx',
          'direct_messages_conversationId_createdAt_id_idx'
        )
      ) <> 5 THEN
        RAISE EXCEPTION 'SPEC-011 query indexes missing';
      END IF;
      IF (
        SELECT count(*) FROM pg_constraint
        WHERE conname IN (
          'note_comments_reply_shape_check',
          'notes_viewCount_nonnegative_check',
          'note_view_subjects_hash_check',
          'direct_conversations_participant_order_check',
          'direct_messages_content_check'
        )
      ) <> 5 THEN
        RAISE EXCEPTION 'SPEC-011 integrity constraints missing';
      END IF;
      IF (
        SELECT count(*) FROM pg_constraint
        WHERE conname IN (
          'note_comments_rootCommentId_fkey',
          'note_comments_replyToId_fkey'
        )
          AND confdeltype = 'r'
      ) <> 2 THEN
        RAISE EXCEPTION 'SPEC-011 structural reply foreign keys are not restrictive';
      END IF;
      IF (SELECT count(*) FROM "legal_acceptances") <> 1
         OR NOT EXISTS (
           SELECT 1 FROM "legal_acceptances"
           WHERE "evidenceKey" = 'legacy-acceptance-early'
             AND "scene" = 'RECONFIRMATION'
         )
         OR NOT EXISTS (
           SELECT 1 FROM "users"
           WHERE "email" = 'legacy@example.com'
             AND "ageRestrictedAt" IS NULL
         ) THEN
        RAISE EXCEPTION 'SPEC-012 legacy legal migration changed existing data';
      END IF;
      IF (
        SELECT count(*) FROM pg_indexes
        WHERE indexname IN (
          'legal_acceptances_evidenceKey_key',
          'legal_acceptances_userId_termsVersion_privacyVersion_scene_key',
          'legal_acceptances_userId_termsVersion_privacyVersion_idx',
          'legal_acceptances_userId_acceptedAt_idx'
        )
      ) <> 4 THEN
        RAISE EXCEPTION 'SPEC-012 legal acceptance indexes missing';
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

async function verifyConcurrentLegalAcceptance() {
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
      `DO $$ BEGIN
        IF (
          SELECT count(*) FROM "legal_acceptances"
          WHERE "userId" = '00000000-0000-4000-8000-000000000124'
            AND "termsVersion" = '${termsVersion}'
            AND "privacyVersion" = '${privacyVersion}'
            AND "scene" = 'RECONFIRMATION'
        ) <> 1 THEN
          RAISE EXCEPTION 'SPEC-012 concurrent legal acceptance was not idempotent';
        END IF;
      END $$;`,
    ),
    { env: composeEnvironment },
  );
}

function concurrentLegalAcceptanceIsSelected() {
  const selectedProjects = playwrightArguments
    .filter((argument) => argument.startsWith('--project='))
    .map((argument) => argument.slice('--project='.length));
  if (
    selectedProjects.length > 0 &&
    !selectedProjects.includes('chromium-1440')
  ) {
    return false;
  }

  const selectedFiles = playwrightArguments.filter((argument) =>
    argument.endsWith('.spec.ts'),
  );
  if (
    selectedFiles.length > 0 &&
    !selectedFiles.some((file) => file.endsWith('legal-terms-and-more.spec.ts'))
  ) {
    return false;
  }

  const grepIndex = playwrightArguments.indexOf('--grep');
  const grepExpression =
    grepIndex >= 0
      ? playwrightArguments[grepIndex + 1]
      : playwrightArguments
          .find((argument) => argument.startsWith('--grep='))
          ?.slice('--grep='.length);
  if (!grepExpression) return true;
  try {
    return new RegExp(grepExpression).test(
      'keeps reconfirmation idempotent across concurrent sessions',
    );
  } catch {
    return false;
  }
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
  mkdirSync(path.dirname(testLegalConfigPath), { recursive: true });
  writeFileSync(
    testLegalConfigPath,
    JSON.stringify(
      {
        operator: { displayName: '小蓝书自动化测试主体' },
        contact: { email: 'legal-e2e@example.test' },
        legal: {
          governingLaw: 'CN_MAINLAND',
          effectiveDate: '2026-01-01',
        },
      },
      null,
      2,
    ),
    { encoding: 'utf8', flag: 'wx' },
  );
  prepareFrontendRuntime({
    repositoryRoot: repoRoot,
    runtimeRoot: testFrontendRoot,
  });

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

  await runPnpm(['--filter', 'backend', 'build'], {
    env: applicationEnvironment,
  });
  backendProcess = start(
    process.execPath,
    [path.join('backend', 'dist', 'main.js')],
    applicationEnvironment,
  );
  await waitFor(`http://127.0.0.1:${backendPort}/health/ready`);

  const frontendRuntime = createFrontendRuntime({
    repositoryRoot: repoRoot,
    runtimeRoot: testFrontendRoot,
    legalConfigPath: testLegalConfigPath,
    port: frontendPort,
    environment: {
      ...process.env,
      BACKEND_URL: `http://127.0.0.1:${backendPort}`,
      NEXT_PUBLIC_API_URL: apiUrl,
    },
  });
  frontendProcess = start(
    frontendRuntime.command,
    frontendRuntime.args,
    frontendRuntime.env,
    frontendRuntime.cwd,
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
        E2E_MEDIA_ROOT: mediaRoot,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0',
        ...(chromiumPath
          ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: chromiumPath }
          : {}),
      },
    },
  );
  if (concurrentLegalAcceptanceIsSelected()) {
    await verifyConcurrentLegalAcceptance();
  }
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
