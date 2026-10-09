BEGIN;

-- Do not silently reassign existing accounts to a different permission level.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "role"::text = 'ADMIN') THEN
    RAISE EXCEPTION 'Unsupported ADMIN accounts exist. Assign each account to CUSTOMER or BARISTA before retrying this migration.';
  END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_legacy";
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'BARISTA');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole"
  USING ("role"::text::"UserRole");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER'::"UserRole";
DROP TYPE "UserRole_legacy";

COMMIT;
