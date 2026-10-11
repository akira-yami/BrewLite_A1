import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerApi, loginApi, getMeApi } from '../src/features/auth/api.ts';

test('registerApi successfully calls /auth/register and returns user + accessToken', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(url, /\/auth\/register$/);
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.equal(body.username, 'newuser');
      return {
        ok: true,
        json: async () => ({
          data: {
            user: { id: 'u1', username: 'newuser', role: 'USER', loyaltyBalance: 0, isActive: true, createdAt: '2026-10-11' },
            accessToken: 'token123',
            expiresIn: 900,
          },
        }),
      };
    };

    const res = await registerApi({ username: 'newuser', password: 'password123' });
    assert.equal(res.accessToken, 'token123');
    assert.equal(res.user.username, 'newuser');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('registerApi throws descriptive error when response is not ok', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      json: async () => ({
        error: { code: 'USERNAME_ALREADY_EXISTS', message: 'Tên đăng nhập đã tồn tại.' },
      }),
    });

    await assert.rejects(
      () => registerApi({ username: 'existing', password: 'password123' }),
      /Tên đăng nhập đã tồn tại\./
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loginApi successfully calls /auth/login and returns user + accessToken', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(url, /\/auth\/login$/);
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        json: async () => ({
          data: {
            user: { id: 'u1', username: 'user1', role: 'USER', loyaltyBalance: 50, isActive: true, createdAt: '2026-10-11' },
            accessToken: 'token456',
            expiresIn: 900,
          },
        }),
      };
    };

    const res = await loginApi({ username: 'user1', password: 'password123' });
    assert.equal(res.accessToken, 'token456');
    assert.equal(res.user.role, 'USER');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loginApi throws descriptive error on invalid credentials', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      json: async () => ({
        error: { code: 'INVALID_CREDENTIALS', message: 'Thông tin đăng nhập không chính xác.' },
      }),
    });

    await assert.rejects(
      () => loginApi({ username: 'user1', password: 'wrong' }),
      /Thông tin đăng nhập không chính xác\./
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getMeApi passes Bearer token to /auth/me and returns user', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(url, /\/auth\/me$/);
      assert.equal(options.headers.Authorization, 'Bearer my-jwt-token');
      return {
        ok: true,
        json: async () => ({
          data: { id: 'u1', username: 'user1', role: 'USER', loyaltyBalance: 100, isActive: true, createdAt: '2026-10-11' },
        }),
      };
    };

    const user = await getMeApi('my-jwt-token');
    assert.equal(user.username, 'user1');
    assert.equal(user.loyaltyBalance, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getMeApi throws error when unauthorized or failed', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      json: async () => ({ message: 'Unauthorized' }),
    });

    await assert.rejects(
      () => getMeApi('invalid-token'),
      /Unauthorized/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
