import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'http://localhost:3101/api/v1';

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
    await page.getByRole('button', { name: '+ Thêm', exact: true }).first().click();
    await page.getByRole('button', { name: /món trong giỏ/ }).click();
    await page.getByRole('button', { name: 'Tiến hành đặt & thanh toán' }).click();
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
    await page.getByRole('button', { name: /^Thanh toán / }).click();
    const response = await paid;
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).data.status).toBe('SUCCEEDED');
    const orderId = response.request().postDataJSON().orderId;
    if (retry) {
      expect(orderId).toBe(failedOrderId);
      expect(response.request().headers()['idempotency-key']).not.toBe(failedKey);
    }
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

test('double click and reload replay a pending payment with the same order and idempotency key', async ({ page, request }) => {
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
  await page.getByRole('button', { name: '+ Thêm', exact: true }).first().click();
  await page.getByRole('button', { name: /món trong giỏ/ }).click();
  await page.getByRole('button', { name: 'Tiến hành đặt & thanh toán' }).click();
  await expect(page).toHaveURL(/\\/checkout/);

  const attempts: Array<{ orderId: string; key: string }> = [];
  await page.route(`${api}/payments`, async (route) => {
    const payload = route.request().postDataJSON();
    attempts.push({
      orderId: payload.orderId,
      key: route.request().headers()['idempotency-key'],
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          success: false,
          isRetried: false,
          status: 'PROCESSING',
          gatewayTransactionId: null,
          errorCode: 'PAYMENT_IN_PROGRESS',
          message: 'Giao dịch đang được xử lý.',
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
  const retryButton = page.getByRole('button', { name: 'Kiểm tra trạng thái giao dịch' });
  await expect(retryButton).toBeVisible();
  const replay = page.waitForResponse(response => response.url() === `${api}/payments` && response.request().method() === 'POST');
  await retryButton.click();
  await replay;

  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});
