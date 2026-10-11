BEGIN;

-- Keep applied migration checksums intact and align the stored enum with the domain.
-- PostgreSQL enum renames preserve existing rows and the column default.
ALTER TYPE "UserRole" RENAME VALUE 'USER' TO 'CUSTOMER';
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'BARISTA';

COMMIT;
