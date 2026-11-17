-- Some databases contain REFUND from an earlier version of the refund flow.
-- Compare as text so this also runs on databases that never had that enum value.
UPDATE "loyalty_transactions"
SET "type" = 'REFUND_CREDIT'
WHERE "type"::text = 'REFUND';
