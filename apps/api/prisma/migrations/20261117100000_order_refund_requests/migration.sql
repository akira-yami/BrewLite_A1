CREATE TYPE "OrderRefundRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "order_refund_requests" (
    "order_id" UUID NOT NULL,
    "status" "OrderRefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "decided_by_user_id" UUID,
    "rejection_reason" VARCHAR(255),

    CONSTRAINT "order_refund_requests_pkey" PRIMARY KEY ("order_id"),
    CONSTRAINT "order_refund_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_refund_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "order_refund_requests_status_requested_at_idx" ON "order_refund_requests"("status", "requested_at");
