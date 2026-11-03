import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadAppConfig } from '../apps/api/src/config/app-config.ts';

const root = new URL('../', import.meta.url);
const requiredVariables = [
  'JWT_SECRET',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'JWT_EXPIRES_IN',
  'ORDER_RESERVATION_TTL_MINUTES',
  'DATABASE_URL',
  'DATABASE_URL_DOCKER',
];

async function readExample(path) {
  return readFile(new URL(path, root), 'utf8');
}

for (const path of ['.env.example', 'apps/api/.env.example']) {
  test(`${path} declares required config and uses a valid JWT duration`, async () => {
    const content = await readExample(path);
    const entries = new Map(
      content
        .split(/\r?\n/)
        .filter((line) => /^\s*[A-Z_][A-Z0-9_]*=/.test(line))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );

    for (const name of requiredVariables) {
      assert.ok(entries.has(name), `${path} is missing ${name}`);
    }
    assert.match(entries.get('JWT_EXPIRES_IN'), /^\d+[smhd]$/i);
    assert.equal(entries.get('JWT_EXPIRES_IN'), '15m');
  });
}

test('requires JWT_SECRET outside test mode', () => {
  assert.throws(
    () => loadAppConfig({ NODE_ENV: 'development', JWT_SECRET: '' }),
    /JWT_SECRET environment variable is required/,
  );
});

test('parses JWT lifetime and reservation TTL units accurately', () => {
  assert.equal(
    loadAppConfig({ NODE_ENV: 'test', JWT_EXPIRES_IN: '15m' }).jwtExpiresInSeconds,
    900,
  );
  assert.equal(
    loadAppConfig({ NODE_ENV: 'test', JWT_EXPIRES_IN: '1h' }).jwtExpiresInSeconds,
    3600,
  );
  assert.equal(
    loadAppConfig({ NODE_ENV: 'test', ORDER_RESERVATION_TTL_MINUTES: '20' })
      .orderReservationTtlMinutes * 60 * 1000,
    20 * 60 * 1000,
  );
});

test('rejects malformed JWT lifetime and non-positive/non-integer reservation TTL', () => {
  for (const value of ['abc', '-5m', '15mS']) {
    assert.throws(
      () => loadAppConfig({ NODE_ENV: 'test', JWT_EXPIRES_IN: value }),
      /JWT_EXPIRES_IN/,
    );
  }
  for (const value of ['0', '-10', 'NaN', '1.5']) {
    assert.throws(
      () => loadAppConfig({ NODE_ENV: 'test', ORDER_RESERVATION_TTL_MINUTES: value }),
      /ORDER_RESERVATION_TTL_MINUTES/,
    );
  }
});
