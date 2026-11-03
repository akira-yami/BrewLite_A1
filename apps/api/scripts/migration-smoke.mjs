import { spawnSync } from 'node:child_process';
import pg from 'pg';

// Explicit disposable database only; never read the application's .env here.
const connectionString = process.env.SMOKE_DATABASE_URL;
if (!connectionString) {
  throw new Error('Set SMOKE_DATABASE_URL to a fresh disposable PostgreSQL database');
}

const url = new URL(connectionString);
if (!url.pathname.slice(1).startsWith('brewlite_foundation_smoke')) {
  throw new Error('Smoke database name must start with brewlite_foundation_smoke');
}
if (url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public') {
  throw new Error('Use the public schema of the disposable database');
}

const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')",
  );
  if (rows[0].count !== 0) {
    throw new Error('Smoke database is not empty; create a fresh database. No reset will be performed.');
  }

  run('node_modules/prisma/build/index.js', ['validate']);
  run('node_modules/prisma/build/index.js', ['generate']);
  run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
  run('node_modules/prisma/build/index.js', ['migrate', 'deploy']); // Replay must be a no-op.
  run('node_modules/prisma/build/index.js', ['migrate', 'status']);

  const { rows: guardIndexes } = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'payments'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%order_id%'
      AND indexdef ILIKE '%status%'
      AND indexdef ILIKE '%PROCESSING%'
    ORDER BY indexname
  `);
  if (
    guardIndexes.length !== 1 ||
    guardIndexes[0]?.indexname !== 'uq_one_processing_payment_per_order'
  ) {
    throw new Error(
      `Expected exactly one PROCESSING-payment guard index named uq_one_processing_payment_per_order; found: ${guardIndexes.map((row) => row.indexname).join(', ') || 'none'}`,
    );
  }
  run('node_modules/vitest/vitest.mjs', ['run', '--config', 'vitest.config.integration.ts']);
  process.stdout.write('Verified exactly one unique PROCESSING-payment index.\n');
} finally {
  await pool.end();
}
