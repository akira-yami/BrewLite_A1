BEGIN;

-- Run before the legacy USER/ADMIN migration, which otherwise collapses BARISTA
-- into USER. Renaming preserves account assignments through that migration.
-- Already-upgraded databases have USER/ADMIN, so this is a no-op for them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'CUSTOMER'
  ) THEN
    ALTER TYPE "UserRole" RENAME VALUE 'CUSTOMER' TO 'USER';
    ALTER TYPE "UserRole" RENAME VALUE 'BARISTA' TO 'ADMIN';
  END IF;
END $$;

COMMIT;
