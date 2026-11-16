import assert from 'node:assert/strict';

function baseUrl(envName) {
  const value = process.env[envName];
  assert.ok(value, `Set ${envName} before running the cloud smoke test`);
  const url = new URL(value);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

const web = baseUrl('SMOKE_WEB_URL');
const api = baseUrl('SMOKE_API_URL');

const checks = [
  ['Web health', new URL('health', web), async response => {
    assert.equal((await response.json()).status, 'ok');
  }],
  ['Web menu', new URL('menu', web), response => {
    assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i);
    return response.body?.cancel();
  }],
  ['API readiness', new URL('health', api), async response => {
    assert.equal((await response.json()).status, 'ok');
  }],
  ['API catalog', new URL('products', api), async response => {
    const { success, data } = await response.json();
    assert.equal(success, true);
    assert.ok(Array.isArray(data) && data.length > 0, 'Expected a seeded catalog');
  }],
];

const results = await Promise.allSettled(checks.map(async ([label, url, verify]) => {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, `${url.pathname} returned HTTP ${response.status}`);
  await verify(response);
  console.log(`PASS ${label}`);
}));

for (const [index, result] of results.entries()) {
  if (result.status === 'rejected') {
    console.error(`FAIL ${checks[index][0]}: ${result.reason.message}`);
    process.exitCode = 1;
  }
}
