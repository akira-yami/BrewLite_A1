-- Preserve existing orders: omitted preferences use the standard recipe (NULL).
ALTER TABLE "order_items"
    ADD COLUMN "sugar_level" INTEGER,
    ADD COLUMN "ice_level" INTEGER,
    ADD CONSTRAINT "order_items_sugar_level_check"
        CHECK ("sugar_level" IS NULL OR "sugar_level" BETWEEN 0 AND 100),
    ADD CONSTRAINT "order_items_ice_level_check"
        CHECK ("ice_level" IS NULL OR "ice_level" BETWEEN 0 AND 100);
