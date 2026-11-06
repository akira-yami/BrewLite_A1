import { enrichVnpayPaymentResponse } from '../helpers/vnpay-test-helper.js';
import { test, expect } from '../fixtures/vnpay-fixtures.js';
import { setupCartWithProduct, proceedToCheckout } from '../helpers/cart-helper.js';

test.describe('VNPAY Double-Click Protection', () => {
  test('double click sends only one POST request', async ({
    page,
    testUser,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /vnpay/i }).click();

    let postCount = 0;
    page.on('response', (response) => {
      if (
        response.url().includes('/payments') &&
        response.request().method() === 'POST'
      ) {
        postCount++;
      }
    });

    const payButton = page.getByRole('button', { name: /^Thanh toán / });
    await payButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });

    await page.waitForTimeout(2000);

    expect(postCount).toBe(1);
  });

  test('status query before replay on page reload', async ({
    page,
    request,
    testUser,
    apiUrl,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /vnpay/i }).click();

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();

    const paymentResponse = await paymentPromise;
    const paymentData = enrichVnpayPaymentResponse(undefined, paymentResponse);
    const idempotencyKey = paymentResponse.request().headers()['idempotency-key'];

    await page.waitForTimeout(1000);
    await page.reload();

    const checkButton = page.getByRole('button', {
      name: /Kiểm tra trạng thái/,
    });

    if (await checkButton.isVisible({ timeout: 5000 })) {
      let statusRequests = 0;
      page.on('response', (response) => {
        if (response.url().includes('/payments/status')) {
          statusRequests++;
        }
      });

      await checkButton.click();
      await page.waitForTimeout(1000);

      expect(statusRequests).toBeGreaterThan(0);
    }
  });

  test('concurrent payment attempts return 409', async ({
    page,
    request,
    testUser,
    apiUrl,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /vnpay/i }).click();

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();

    const paymentResponse = await paymentPromise;
    const paymentData = enrichVnpayPaymentResponse(undefined, paymentResponse);
    const { orderId } = paymentData.data;

    const concurrentResponse = await request.post(apiUrl + '/payments', {
      data: { orderId, method: 'VNPAY' },
      headers: {
        Authorization: 'Bearer ' + testUser.accessToken,
        'Idempotency-Key': 'concurrent-key-' + Date.now(),
      },
    });

    expect(concurrentResponse.status()).toBe(409);
  });
});
