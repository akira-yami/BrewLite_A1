-- Existing items have no special preparation instructions.
ALTER TABLE "order_items" ADD COLUMN "note" VARCHAR(500);
