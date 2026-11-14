import { expect, test } from '@playwright/test';

const orderId = 'retry-order';
const gatewayUrl = 'https://vnpay.example.test/retry';
const order = {
  id: orderId,
  orderNumber: 'ORD-RETRY',
  subtotal: 40000,
  total: 40000,
  discountAmount: 0,
  currency: 'VND',
  createdAt: '2026-11-01T00:00:00Z',
  items: [],
};

/** Seed a valid JWT token, optional checkout state, and mock /auth/me. */
async function setupAuth(
  page: import('@playwright/test').Page,
  pendingCheckout?: {
    orderId: string;
    idempotencyKey: string;
    method: 'VNPAY';
    cartFingerprint: string;
    cartItemsRemoved: true;
  },
) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  await page.addInitScript(({ token, checkout }) => {
    localStorage.setItem('brewlite_token', token);
    if (checkout && !sessionStorage.getItem('brewlite_pending_checkout')) {
      sessionStorage.setItem('brewlite_pending_checkout', JSON.stringify(checkout));
    }
  }, {
    token: `e30.${payload}.test`,
    checkout: pendingCheckout,
  });
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { data: {
    id: 'customer', username: 'customer', isActive: true, role: 'CUSTOMER',
  } } }));
}

for (const { path, confirmedImmediately } of [
  { path: '/orders', confirmedImmediately: false },
  { path: `/orders/${orderId}`, confirmedImmediately: false },
  { path: `/orders/${orderId}`, confirmedImmediately: true },
]) {
  test(`retry from ${path} confirms the original order ${confirmedImmediately ? 'immediately' : 'after returning from VNPay'}`, async ({ page, baseURL }) => {
    await setupAuth(page);

    let paid = false;
    const orderResponse = () => ({ ...order, status: paid ? 'PAID' : 'PAYMENT_FAILED' });
    await page.route('**/api/v1/orders/me', route => route.fulfill({ json: { data: [orderResponse()] } }));
    await page.route(`**/api/v1/orders/${orderId}`, route => route.fulfill({ json: { data: orderResponse() } }));

    let attemptKey: string | undefined;
    let paymentPosts = 0;
    await page.route('**/api/v1/payments', async route => {
      paymentPosts++;
      expect(route.request().postDataJSON()).toEqual({ orderId, method: 'VNPAY', retryAttempt: true });
      attemptKey = route.request().headers()['idempotency-key'];
      expect(attemptKey).toBeTruthy();
      paid = confirmedImmediately;
      await route.fulfill({ json: { data: {
        status: paid ? 'SUCCEEDED' : 'PROCESSING', success: paid, paymentUrl: gatewayUrl,
      } } });
    });
    await page.route(gatewayUrl, route => route.fulfill({
      status: 302,
      headers: { location: new URL('/checkout?paymentReturn=1', baseURL).toString() },
    }));
    await page.route('**/api/v1/payments/status', async route => {
      expect(route.request().headers()['idempotency-key']).toBe(attemptKey);
      await route.fulfill({ json: { data: {
        status: paid ? 'SUCCEEDED' : 'PROCESSING', success: paid, paymentUrl: gatewayUrl,
      } } });
    });

    await page.goto(path);
    await page.getByRole('button', { name: /^Thanh toán lại/ }).click();
    if (!confirmedImmediately) {
      await expect(page.getByText('Đang chờ xác nhận thanh toán')).toBeVisible();
      paid = true;
    }
    await expect(page).toHaveURL(new RegExp(`/orders/confirmation\\?orderId=${orderId}$`), { timeout: 15_000 });
    await expect(page.getByText('Đặt hàng thành công')).toBeVisible();
    await expect(page.getByRole('heading', { name: order.orderNumber })).toBeVisible();
    expect(paymentPosts).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem('brewlite_pending_checkout'))).toBeNull();
  });
}

// ---------------------------------------------------------------------------
// PENDING order — within deadline
// ---------------------------------------------------------------------------

for (const path of ['/orders', `/orders/${orderId}`] as const) {
  test(`PENDING within deadline: CTA is visible and triggers payment flow from ${path}`, async ({ page, baseURL }) => {
    await setupAuth(page);

    const reservationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pendingOrder = { ...order, status: 'PENDING', reservationExpiresAt };

    await page.route('**/api/v1/orders/me', route =>
      route.fulfill({ json: { data: [pendingOrder] } }),
    );
    await page.route(`**/api/v1/orders/${orderId}`, route =>
      route.fulfill({ json: { data: pendingOrder } }),
    );

    let paymentPosts = 0;
    await page.route('**/api/v1/payments', async route => {
      paymentPosts++;
      expect(route.request().postDataJSON()).toEqual({ orderId, method: 'VNPAY', retryAttempt: true });
      await route.fulfill({ json: { data: {
        status: 'PROCESSING', success: false, paymentUrl: gatewayUrl,
      } } });
    });
    // Intercept the VNPay redirect so the test does not leave the app origin.
    await page.route(gatewayUrl, route => route.fulfill({
      status: 302,
      headers: { location: new URL('/checkout?paymentReturn=1', baseURL).toString() },
    }));

    await page.goto(path);

    const cta = page.getByRole('button', { name: /Thanh toán lại/ });
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    await cta.click();

    // After clicking, one POST to /payments must have fired and the UI should
    // navigate toward the VNPay gateway (which we intercepted above).
    await expect(page).toHaveURL(/\/checkout(\?|$)/, { timeout: 15_000 });
    expect(paymentPosts).toBe(1);
  });
}

// ---------------------------------------------------------------------------
// PENDING order — past deadline
// ---------------------------------------------------------------------------

test('PENDING past deadline: CTA is absent and expiry notice appears on /orders', async ({ page }) => {
  await setupAuth(page);

  const reservationExpiresAt = new Date(Date.now() - 1000).toISOString();
  const expiredOrder = { ...order, status: 'PENDING', reservationExpiresAt };

  await page.route('**/api/v1/orders/me', route =>
    route.fulfill({ json: { data: [expiredOrder] } }),
  );
  await page.route(`**/api/v1/orders/${orderId}`, route =>
    route.fulfill({ json: { data: expiredOrder } }),
  );

  await page.goto('/orders');

  // The "Thanh toán lại →" button on the list card must NOT be rendered.
  await expect(page.getByRole('button', { name: /Thanh toán lại/ })).toHaveCount(0);
  // The expiry note that replaces the CTA must be visible.
  await expect(page.getByText('Đơn đã hết hạn thanh toán và bị hủy.')).toBeVisible();
});

test(`PENDING past deadline: CTA is absent and expiry alert appears on /orders/${orderId}`, async ({ page }) => {
  await setupAuth(page);

  const reservationExpiresAt = new Date(Date.now() - 1000).toISOString();
  const expiredOrder = { ...order, status: 'PENDING', reservationExpiresAt };

  await page.route('**/api/v1/orders/me', route =>
    route.fulfill({ json: { data: [expiredOrder] } }),
  );
  await page.route(`**/api/v1/orders/${orderId}`, route =>
    route.fulfill({ json: { data: expiredOrder } }),
  );

  await page.goto(`/orders/${orderId}`);

  // The payment CTA button must NOT be rendered on the detail page.
  await expect(page.getByRole('button', { name: /Thanh toán lại/ })).toHaveCount(0);
  // The amber expiry alert that replaces the CTA section must be visible.
  await expect(
    page.getByText('Thời gian giữ chỗ 15 phút đã kết thúc', { exact: false }),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Retry must rotate a stale VNPay idempotency key from sessionStorage.
// ---------------------------------------------------------------------------

const staleVnpayKey = '11111111-1111-4111-8111-111111111111';

for (const status of ['PENDING', 'PAYMENT_FAILED'] as const) {
  test(`${status} retry: creates a fresh VNPay key instead of replaying the stale checkout key`, async ({ page, baseURL }) => {
    await setupAuth(page, {
      orderId,
      idempotencyKey: staleVnpayKey,
      method: 'VNPAY',
      cartFingerprint: '[]',
      cartItemsRemoved: true,
    });

    const reservationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const retryableOrder = { ...order, status, reservationExpiresAt };

    await page.route('**/api/v1/orders/me', route =>
      route.fulfill({ json: { data: [retryableOrder] } }),
    );
    await page.route(`**/api/v1/orders/${orderId}`, route =>
      route.fulfill({ json: { data: retryableOrder } }),
    );

    let submittedKey: string | undefined;
    let paymentPosts = 0;
    await page.route('**/api/v1/payments', async route => {
      paymentPosts++;
      submittedKey = route.request().headers()['idempotency-key'];
      expect(submittedKey).toBeTruthy();
      expect(submittedKey).not.toBe(staleVnpayKey);
      expect(route.request().postDataJSON()).toEqual({ orderId, method: 'VNPAY', retryAttempt: true });
      await route.fulfill({ json: { data: {
        status: 'PROCESSING', success: false, paymentUrl: gatewayUrl,
      } } });
    });
    await page.route(gatewayUrl, route => route.fulfill({
      status: 302,
      headers: { location: new URL('/checkout?paymentReturn=1', baseURL).toString() },
    }));

    await page.goto(`/orders/${orderId}`);
    await page.getByRole('button', { name: /Thanh toán lại/ }).click();

    await expect(page).toHaveURL(/\/checkout\?paymentReturn=1$/, { timeout: 15_000 });
    expect(paymentPosts).toBe(1);
    expect(submittedKey).not.toBe(staleVnpayKey);
    expect(await page.evaluate(() => {
      const value = sessionStorage.getItem('brewlite_pending_checkout');
      return value ? JSON.parse(value).idempotencyKey : null;
    })).toBe(submittedKey);
  });
}
