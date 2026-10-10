import { spawnSync } from 'node:child_process';
import pg from 'pg';

// Explicit disposable database only; never read the application's .env here.
const connectionString = process.env.SMOKE_DATABASE_URL;
if (!connectionString) throw new Error('Set SMOKE_DATABASE_URL to a fresh disposable PostgreSQL database');
const url = new URL(connectionString);
if (!url.pathname.slice(1).startsWith('brewlite_foundation_smoke')) {
  throw new Error('Smoke database name must start with brewlite_foundation_smoke');
}
if (url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public') {
  throw new Error('Use the public schema of the disposable database');
}
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
try {
  const { rows } = await pool.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')");
  if (rows[0].count !== 0) throw new Error('Smoke database is not empty; create a fresh database. No reset will be performed.');
} finally {
  await pool.end();
}

const env = { ...process.env, DATABASE_URL: connectionString };
function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('node_modules/prisma/build/index.js', ['validate']);
run('node_modules/prisma/build/index.js', ['generate']);
run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
run('node_modules/prisma/build/index.js', ['migrate', 'deploy']); // Replay must be a no-op.
run('node_modules/prisma/build/index.js', ['migrate', 'status']);
run('node_modules/vitest/vitest.mjs', ['run', '--config', 'vitest.config.integration.ts']);
