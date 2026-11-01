import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const composeFile = fileURLToPath(new URL('../compose.yaml', import.meta.url));
const exampleEnv = fileURLToPath(new URL('../.env.example', import.meta.url));
const testDir = mkdtempSync(join(tmpdir(), 'brewlite-compose-'));
const emptyEnv = join(testDir, 'empty.env');
writeFileSync(emptyEnv, '');
after(() => { unlinkSync(emptyEnv); rmdirSync(testDir); });

function config(secret, envFile = emptyEnv, json = false) {
  const env = { ...process.env };

  delete env.JWT_SECRET;
  delete env.COMPOSE_ENV_FILES;

  // Giá trị giả lập chỉ dùng để kiểm tra cấu hình Compose.
  // Không kết nối tới database thật.
  env.DATABASE_URL_DOCKER =
    'postgresql://brewlite:test@postgres:5432/brewlite';

  if (secret !== undefined) {
    env.JWT_SECRET = secret;
  }

  return spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      envFile,
      '--file',
      composeFile,
      'config',
      ...(json ? ['--format', 'json'] : ['--quiet']),
    ],
    {
      env,
      encoding: 'utf8',
      timeout: 15000,
    },
  );
}

test('Compose rejects an absent JWT secret before starting services', () => {
  const result = config();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('Compose rejects an empty JWT secret', () => {
  const result = config('');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('copying the example environment still requires a private JWT secret', () => {
  const result = config(undefined, exampleEnv);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('Compose passes the provided secret unchanged to the backend', () => {
  const secret = randomBytes(48).toString('hex');
  const result = config(secret, emptyEnv, true);
  assert.equal(result.status, 0, 'Compose must accept an explicitly provided secret');
  const resolved = JSON.parse(result.stdout);
  assert.ok(resolved.services.backend.environment.JWT_SECRET === secret);
});
