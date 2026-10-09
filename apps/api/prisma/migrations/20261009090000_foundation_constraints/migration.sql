-- Preserve the original migration; enforce the invariants from database-design.md.
ALTER TABLE "product_variants" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users" ADD CONSTRAINT "users_loyalty_balance_nonnegative"
  CHECK ("loyalty_balance" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_values_valid"
  CHECK ("price" >= 0 AND "stock" >= 0 AND "version" >= 0);
ALTER TABLE "toppings" ADD CONSTRAINT "toppings_price_nonnegative"
  CHECK ("price" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_totals_valid"
  CHECK ("subtotal" >= 0 AND "discount_amount" >= 0 AND "discount_amount" <= "subtotal"
    AND "total" = "subtotal" - "discount_amount");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_values_valid"
  CHECK ("unit_price" >= 0 AND "quantity" > 0);
ALTER TABLE "order_item_toppings" ADD CONSTRAINT "order_item_toppings_values_valid"
  CHECK ("unit_price" >= 0 AND "quantity" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_nonnegative"
  CHECK ("amount" >= 0);
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_quantity_positive"
  CHECK ("quantity" > 0);
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_policy_valid"
  CHECK ("discount_value" > 0 AND ("discount_type" <> 'PERCENTAGE' OR "discount_value" <= 100)
    AND ("max_discount" IS NULL OR "max_discount" >= 0) AND "min_order_value" >= 0
    AND ("usage_limit" IS NULL OR "usage_limit" > 0) AND "per_user_limit" > 0
    AND "starts_at" < "ends_at");
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_discount_nonnegative"
  CHECK ("discount_amount" >= 0);
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_balance_nonnegative"
  CHECK ("balance_after" >= 0);

CREATE UNIQUE INDEX "uq_one_successful_payment_per_order"
  ON "payments" ("order_id") WHERE "status" = 'SUCCEEDED';
CREATE UNIQUE INDEX "uq_loyalty_earn_per_order"
  ON "loyalty_transactions" ("order_id", "type")
  WHERE "order_id" IS NOT NULL AND "type" = 'EARN';
