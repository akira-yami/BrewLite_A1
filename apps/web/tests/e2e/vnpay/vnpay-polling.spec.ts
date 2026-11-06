import { enrichVnpayPaymentResponse } from '../helpers/vnpay-test-helper.js';
import { test, expect } from '../fixtures/vnpay-fixtures.js';
import { setupCartWithProduct, proceedToCheckout } from '../helpers/cart-helper.js';

test.describe('VNPAY Polling Behavior', () => {
  test('polling occurs at 5-second intervals', async ({
    page,
    testUser,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /vnpay/i }).click();

    const statusRequests: number[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/payments/status')) {
        statusRequests.push(Date.now());
      }
    });

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();
    await paymentPromise;

    await page.waitForTimeout(12000);

    expect(statusRequests.length).toBeGreaterThanOrEqual(2);

    if (statusRequests.length >= 2) {
      const interval = statusRequests[1] - statusRequests[0];
      expect(interval).toBeGreaterThan(4000);
      expect(interval).toBeLessThan(6000);
    }
  });

  test('polling stops on SUCCEEDED', async ({
    page,
    request,
    vnpayHelper,
    testUser,
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
    const paymentData = enrichVnpayPaymentResponse(await paymentResponse.json(), paymentResponse);
    const { gatewayReference, amount } = paymentData.data;

    await page.waitForTimeout(2000);

    await vnpayHelper.simulateIpn(request, {
      gatewayReference,
      amount: BigInt(amount),
      responseCode: '00',
      transactionStatus: '00',
    });

    await page.waitForURL(/\/orders\/confirmation/, { timeout: 15000 });

    let statusRequestsAfterSuccess = 0;
    page.on('response', (response) => {
      if (response.url().includes('/payments/status')) {
        statusRequestsAfterSuccess++;
      }
    });

    await page.waitForTimeout(10000);

    expect(statusRequestsAfterSuccess).toBe(0);
  });

  test('polling stops on FAILED', async ({
    page,
    request,
    vnpayHelper,
    testUser,
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
    const paymentData = enrichVnpayPaymentResponse(await paymentResponse.json(), paymentResponse);
    const { gatewayReference, amount } = paymentData.data;

    await vnpayHelper.simulateIpn(request, {
      gatewayReference,
      amount: BigInt(amount),
      responseCode: '07',
      transactionStatus: '02',
    });

    await page.waitForTimeout(10000);

    const errorAlert = page.getByRole('alert');
    await expect(errorAlert).toBeVisible();
  });

  test('polling includes correct Idempotency-Key header', async ({
    page,
    testUser,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /vnpay/i }).click();

    let paymentKey: string | null = null;
    const statusKeys: string[] = [];

    page.on('response', async (response) => {
      if (
        response.url().includes('/payments') &&
        response.request().method() === 'POST'
      ) {
        paymentKey = response.request().headers()['idempotency-key'];
      }
      if (response.url().includes('/payments/status')) {
        statusKeys.push(response.request().headers()['idempotency-key']);
      }
    });

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();
    await paymentPromise;

    await page.waitForTimeout(10000);

    expect(paymentKey).toBeTruthy();
    expect(statusKeys.length).toBeGreaterThan(0);

    for (const key of statusKeys) {
      expect(key).toBe(paymentKey);
    }
  });
});
