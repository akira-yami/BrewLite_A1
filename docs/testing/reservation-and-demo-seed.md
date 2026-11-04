# Reservation lifecycle and demo catalog

## Payment and expiry

Payment admission and expiry use the same order row lock. A payment admitted
before the Order TTL commits PROCESSING before gateway I/O. Cleanup waits for
settlement; a successful gateway result consumes reservations even if it arrives
after TTL. Failure allows the next expiry scan to cancel and release resources.
Integration coverage includes success/failure after TTL, concurrent workers,
idempotent cleanup and rollback on coupon-write failure.

The Order reservationExpiresAt is the authoritative deadline. A reservation
with an earlier deadline does not cause the job to cancel a still-valid order.
When the Order expires, the job repairs any later ACTIVE reservation deadline
to the Order deadline and releases stock/coupon in the cancellation transaction.
Both directions of deadline drift have PostgreSQL integration coverage.

## Re-running demo seeds on an existing database

Run the usual `npm run db:seed` from apps/api with the intended demo DATABASE_URL.
The catalog seed changes an existing sample image only when its URL exactly
matches the previous seed's URL. Custom images, IDs, prices and stock are kept.
Fresh catalog entries use the local product images.

After the 24 replacement demo products are seeded, the mock seed retires exactly
MOCK-PROD-001 through MOCK-PROD-030 by setting their products and variants inactive
in one transaction. It does not delete rows, order snapshots, reservations or
recipes. SKUs outside that exact list are untouched. Re-running is idempotent.
No production database cleanup has been executed as part of the documented seed changes.

## Demo UI and assets

The demo includes 30 local WebP product images under apps/web/public/products,
six base catalog products plus 24 named demo products, product-card image updates,
and menu pagination at nine products per page. Search/category changes reset the
page; pagination clamps to available results and scrolls back to the menu.

Acceptance checks:

- Payment in flight beyond TTL remains consistent with order/inventory/coupon.
- Expiry recovers from both directions of Order/Reservation deadline drift.
- Legacy sample images migrate while custom edits remain intact.
- Legacy mock products disappear from the active catalog without deleting history.
- Repeated seeds do not create duplicate products.
- CI validates frontend/backend, database integration, docs and browser checkout.
