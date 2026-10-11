BEGIN;

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_legacy";
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole"
  USING (
    CASE
      WHEN "role"::text = 'ADMIN' THEN 'ADMIN'::"UserRole"
      ELSE 'USER'::"UserRole"
    END
  );
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";
DROP TYPE "UserRole_legacy";

COMMIT;
