import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = process.env.E2E_API_URL ?? 'http://localhost:3101/api/v1';

for (const retry of [false, true]) {
  test(retry ? 'payment thất bại → retry cùng order → confirmation' : 'menu → cart → payment → confirmation', async ({ page, request }) => {
    // Chỉ tạo tài khoản qua API thật; không inject cart hoặc mock response checkout.
    const registration = await request.post(`${api}/auth/register`, {
      data: { username: `e2e_${randomUUID().replaceAll('-', '').slice(0, 20)}`, password: 'E2e-password-123' },
    });
    expect(registration.ok()).toBeTruthy();
    const { data: { accessToken } } = await registration.json();
    await page.goto('/menu');
    await page.evaluate(token => localStorage.setItem('brewlite_token', token), accessToken);
    await page.reload();
    // Chọn sản phẩm bằng nút Tùy chọn trên ProductCard.
// Chỉ chọn nút đang được bật (sản phẩm còn hàng).
await page.locator('button:not(:disabled)')
  .filter({ hasText: 'Tùy chọn' })
  .first()
  .click();

// Modal chi tiết sản phẩm mở ra.
const addToCartButton = page.getByRole('button', {
  name: /Thêm vào giỏ/,
});

await expect(addToCartButton).toBeVisible();
await expect(addToCartButton).toBeEnabled();

// Thêm sản phẩm vào giỏ.
// onAddedToCart tự động mở CartDrawer.
await addToCartButton.click();

// Tiến hành checkout.
await page.getByRole('button', {
  name: 'Tiến hành đặt & thanh toán',
}).click();
    await expect(page).toHaveURL(/\/checkout/);

    let failedOrderId: string | undefined;
    let failedKey: string | undefined;
    if (retry) {
      // Mock gateway deterministic: CARD fail, E_WALLET succeed.
      // Vẫn đi qua service/DB thật nên test bắt được lỗi thiếu transition retry.
      await page.getByRole('button', { name: /Thẻ ngân hàng/ }).click();
      const failure = page.waitForResponse(r => r.url() === `${api}/payments` && r.request().method() === 'POST');
      await page.getByRole('button', { name: /^Thanh toán / }).click();
      const response = await failure;
      expect((await response.json()).data.status).toBe('FAILED');
      failedOrderId = response.request().postDataJSON().orderId;
      failedKey = response.request().headers()['idempotency-key'];
      await expect(page.getByRole('alert').filter({ hasText: 'Số dư hoặc hạn mức thanh toán không đủ' })).toBeVisible();
      await page.getByRole('button', { name: /Ví điện tử/ }).click();
    }

    const paid = page.waitForResponse(r => r.url() === `${api}/payments` && r.request().method() === 'POST');
    await page.getByRole('button', { name: retry ? /^Thử thanh toán lại / : /^Thanh toán / }).click();
    const response = await paid;
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).data.status).toBe('SUCCEEDED');
    const orderId = response.request().postDataJSON().orderId;
    const successfulKey = response.request().headers()['idempotency-key'];
    if (retry) {
      expect(orderId).toBe(failedOrderId);
      expect(successfulKey).not.toBe(failedKey);
      const failedStatus = await request.get(`${api}/payments/status`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': failedKey! },
      });
      expect(failedStatus.ok()).toBeTruthy();
      expect((await failedStatus.json()).data.status).toBe('FAILED');
    }
    const successfulStatus = await request.get(`${api}/payments/status`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': successfulKey },
    });
    expect(successfulStatus.ok()).toBeTruthy();
    expect((await successfulStatus.json()).data).toMatchObject({
      success: true,
      isRetried: true,
      status: 'SUCCEEDED',
    });
    await expect(page).toHaveURL(new RegExp(`/orders/confirmation\\?orderId=${orderId}`));
    await expect(page.getByRole('heading', { name: 'Cảm ơn bạn đã chọn BrewLite' })).toBeVisible();
    // Xác minh trạng thái lưu bền và cart đã được xóa, không chỉ chuyển trang.
    const detail = await request.get(`${api}/orders/${orderId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(detail.ok()).toBeTruthy();
    expect((await detail.json()).data.status).toBe('PAID');
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Giỏ hàng đang trống' })).toBeVisible();
  });
}

test('double click and reload query payment status, replaying POST only when the status row is absent', async ({ page, request }) => {
  const registration = await request.post(`${api}/auth/register`, {
    data: {
      username: `e2e_pending_${randomUUID().replaceAll('-', '').slice(0, 18)}`,
      password: 'E2e-password-123',
    },
  });
  expect(registration.ok()).toBeTruthy();
  const { data: { accessToken } } = await registration.json();

  await page.goto('/menu');
  await page.evaluate(token => localStorage.setItem('brewlite_token', token), accessToken);
  await page.reload();
  // ProductCard now opens ProductDetailModal through the "Tùy chọn" action;
  // the legacy "+ Thêm" button no longer exists on the menu cards.
  await page.locator('button:not(:disabled)')
    .filter({ hasText: 'Tùy chọn' })
    .first()
    .click();

  const addToCartButton = page.getByRole('button', { name: /Thêm vào giỏ/ });
  await expect(addToCartButton).toBeVisible();
  await expect(addToCartButton).toBeEnabled();
  await addToCartButton.click(); // onAddedToCart opens CartDrawer.
  await page.getByRole('button', { name: 'Tiến hành đặt & thanh toán' }).click();
  await expect(page).toHaveURL(/checkout/);

  const attempts: Array<{ orderId: string; key: string }> = [];
  let postCount = 0;
  await page.route(`${api}/payments`, async (route) => {
    const payload = route.request().postDataJSON();
    attempts.push({
      orderId: payload.orderId,
      key: route.request().headers()['idempotency-key'],
    });
    postCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (postCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            success: false,
            isRetried: false,
            status: 'PROCESSING',
            gatewayTransactionId: null,
            errorCode: null,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'PAYMENT_IN_PROGRESS', message: 'Giao dịch đang được xử lý.' },
      }),
    });
  });

  const statusKeys: string[] = [];
  let statusCount = 0;
  await page.route(`${api}/payments/status`, async (route) => {
    statusCount += 1;
    statusKeys.push(route.request().headers()['idempotency-key']);
    if (statusCount === 1) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'PAYMENT_NOT_FOUND', message: 'Chưa có bản ghi Payment.' },
        }),
      });
      return;
    }
    const status = statusCount === 2 ? 'PROCESSING' : 'SUCCEEDED';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          success: status === 'SUCCEEDED',
          isRetried: true,
          status,
          gatewayTransactionId: status === 'SUCCEEDED' ? 'MOCK_E2E_RECOVERED' : null,
          errorCode: null,
        },
      }),
    });
  });

  const payButton = page.getByRole('button', { name: /^Thanh toán / });
  await payButton.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await page.waitForResponse(response => response.url() === `${api}/payments` && response.request().method() === 'POST');
  await expect(page.getByRole('button', { name: 'Kiểm tra trạng thái giao dịch' })).toBeVisible();
  expect(attempts).toHaveLength(1);

  await page.reload();
  const checkButton = page.getByRole('button', { name: 'Kiểm tra trạng thái giao dịch' });
  await expect(checkButton).toBeVisible();

  const missingStatus = page.waitForResponse(response =>
    response.url() === `${api}/payments/status` && response.status() === 404,
  );
  const sameKeyReplay = page.waitForResponse(response =>
    response.url() === `${api}/payments` && response.request().method() === 'POST' && response.status() === 409,
  );
  await checkButton.click();
  await Promise.all([missingStatus, sameKeyReplay]);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);

  const processingStatus = page.waitForResponse(response =>
    response.url() === `${api}/payments/status` && response.status() === 200,
  );
  await checkButton.click();
  await processingStatus;
  expect(attempts).toHaveLength(2);

  const succeededStatus = page.waitForResponse(response =>
    response.url() === `${api}/payments/status` && response.status() === 200,
  );
  await checkButton.click();
  await succeededStatus;
  await expect(page).toHaveURL(/\/orders\/confirmation\?orderId=/);
  expect(attempts).toHaveLength(2);
  expect(statusKeys).toHaveLength(3);
  expect(statusKeys.every(key => key === attempts[0]?.key)).toBe(true);
});