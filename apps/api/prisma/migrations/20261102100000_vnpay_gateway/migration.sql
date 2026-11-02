ALTER TABLE "payments"
  ADD COLUMN "gateway_provider" VARCHAR(20) NOT NULL DEFAULT 'MOCK',
  ADD COLUMN "gateway_reference" VARCHAR(100),
  ADD COLUMN "payment_url" TEXT;

CREATE UNIQUE INDEX "payments_gateway_reference_key"
  ON "payments"("gateway_reference");
