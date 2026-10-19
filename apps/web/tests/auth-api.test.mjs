import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function setup(response, { token = 'current-token', jsonFails = false } = {}) {
  const requests = [];
  const invalidated = [];
  const authSession = {
    getToken: () => token,
    invalidate: (value) => invalidated.push(value),
  };
  const { outputText } = ts.transpileModule(
    readFileSync(
      new URL('../src/features/auth/api.ts', import.meta.url),
      'utf8',
    ),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    },
  );
  const compiledModule = { exports: {} };
  const fetch = async (url, init) => {
    requests.push({ url, init });
    if (response instanceof Error) throw response;
    return {
      ...response,
      json: async () => {
        if (jsonFails) throw new Error('not JSON');
        return response.body;
      },
    };
  };
  new Function('require', 'module', 'exports', 'fetch', outputText)(
    (name) => {
      assert.match(name, /session/);
      return { authSession };
    },
    compiledModule,
    compiledModule.exports,
    fetch,
  );
  return { api: compiledModule.exports, requests, invalidated };
}

test('profile request sends the token and does not cache private data', async () => {
  const { api, requests } = setup({
    ok: true,
    status: 200,
    body: { data: { username: 'huy' } },
  });
  assert.deepEqual(await api.getMeApi('token'), { username: 'huy' });
  assert.equal(
    new Headers(requests[0].init.headers).get('Authorization'),
    'Bearer token',
  );
  assert.equal(requests[0].init.cache, 'no-store');
});

test('protected 401 invalidates its own token even with a non-JSON response', async () => {
  const { api, invalidated } = setup(
    { ok: false, status: 401 },
    { jsonFails: true },
  );
  await assert.rejects(
    api.getMeApi('old-token'),
    (error) => error.status === 401,
  );
  assert.deepEqual(invalidated, ['old-token']);
});

test('invalid login credentials show an error without logging out an existing session', async () => {
  const { api, invalidated } = setup({
    ok: false,
    status: 401,
    body: { error: { message: 'Sai tài khoản hoặc mật khẩu.' } },
  });
  await assert.rejects(
    api.loginApi({ username: 'wrong', password: 'wrong' }),
    /Sai tài khoản/,
  );
  assert.deepEqual(invalidated, []);
});

test('server and network errors do not invalidate a session', async () => {
  for (const response of [
    { ok: false, status: 503, body: {} },
    new Error('network'),
  ]) {
    const { api, invalidated } = setup(response);
    await assert.rejects(api.getMeApi('token'));
    assert.deepEqual(invalidated, []);
  }
});

test('protected requests use the current token and reject missing sessions before fetch', async () => {
  const { api, requests } = setup({
    ok: true,
    status: 200,
    body: { data: 'private' },
  });
  assert.equal(await api.authenticatedRequest('/auth/me'), 'private');
  assert.equal(
    new Headers(requests[0].init.headers).get('Authorization'),
    'Bearer current-token',
  );
  const guest = setup({ ok: true }, { token: null });
  await assert.rejects(
    guest.api.authenticatedRequest('/auth/me'),
    (error) => error.status === 401,
  );
  assert.equal(guest.requests.length, 0);
});

test('registration and login unwrap API responses', async () => {
  const { api } = setup({
    ok: true,
    status: 201,
    body: { data: { accessToken: 'token' } },
  });
  assert.deepEqual(
    await api.registerApi({ username: 'huy', password: 'password' }),
    { accessToken: 'token' },
  );
  assert.deepEqual(
    await api.loginApi({ username: 'huy', password: 'password' }),
    { accessToken: 'token' },
  );
});

test('Nest validation arrays produce readable errors', async () => {
  const { api } = setup({
    ok: false,
    status: 400,
    body: { message: ['Username không hợp lệ', 'Password quá ngắn'] },
  });
  await assert.rejects(
    api.registerApi({ username: '', password: '' }),
    /Username không hợp lệ.*Password quá ngắn/,
  );
});
