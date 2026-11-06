import { enrichVnpayPaymentResponse } from '../helpers/vnpay-test-helper.js';
import { test, expect } from '../fixtures/vnpay-fixtures.js';
import { setupCartWithProduct, proceedToCheckout } from '../helpers/cart-helper.js';
import { randomUUID } from 'node:crypto';

test.describe('VNPAY Idempotency & Retry Safety', () => {
  test('retry after FAILED creates new payment record', async ({
    page,
    request,
    vnpayHelper,
    testUser,
    apiUrl,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /vnpay/i }).click();

    const firstPaymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();

    const firstPaymentResponse = await firstPaymentPromise;
    const firstPaymentData = enrichVnpayPaymentResponse(undefined, firstPaymentResponse);
    const { gatewayReference: ref1, orderId, amount } = firstPaymentData.data;
    const firstKey = firstPaymentResponse.request().headers()['idempotency-key'];

    const failIpn = await vnpayHelper.simulateIpn(request, {
      gatewayReference: ref1,
      amount: BigInt(amount),
      responseCode: '07',
      transactionStatus: '02',
    });
    expect(failIpn.RspCode).toBe('00');

    // Wait for the signed failure to reach the UI through status polling.
    const retryButton = page.getByRole('button', { name: /^Thử thanh toán lại / });
    await expect(retryButton).toBeVisible({ timeout: 15000 });

    const retryPaymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await retryButton.click();

    const retryPaymentResponse = await retryPaymentPromise;
    const retryPaymentData = enrichVnpayPaymentResponse(undefined, retryPaymentResponse);
    const { gatewayReference: ref2 } = retryPaymentData.data;
    const retryKey = retryPaymentResponse.request().headers()['idempotency-key'];

    expect(retryPaymentResponse.ok()).toBeTruthy();
    expect(retryPaymentData.data.orderId).toBe(orderId);
    expect(retryKey).not.toBe(firstKey);
    expect(ref2).not.toBe(ref1);

    const successIpn = await vnpayHelper.simulateIpn(request, {
      gatewayReference: ref2,
      amount: BigInt(amount),
      responseCode: '00',
      transactionStatus: '00',
    });
    expect(successIpn.RspCode).toBe('00');

    await page.waitForURL(/\/orders\/confirmation/, { timeout: 15000 });

    const orderResponse = await request.get(apiUrl + '/orders/' + orderId, {
      headers: { Authorization: 'Bearer ' + testUser.accessToken },
    });
    const orderData = await orderResponse.json();
    expect(orderData.data.status).toBe('PAID');
  });

  test('retry during PROCESSING returns 409 error', async ({
    page,
    request,
    testUser,
    apiUrl,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /vnpay/i }).click();

    const firstPaymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();

    const firstPaymentResponse = await firstPaymentPromise;
    const firstPaymentData = enrichVnpayPaymentResponse(undefined, firstPaymentResponse);
    const { orderId } = firstPaymentData.data;

    const retryResponse = await request.post(apiUrl + '/payments', {
      data: { orderId, method: 'VNPAY' },
      headers: {
        Authorization: 'Bearer ' + testUser.accessToken,
        'Idempotency-Key': randomUUID(),
      },
    });

    expect(retryResponse.status()).toBe(409);
    const errorData = await retryResponse.json();
    expect(errorData.code).toBe('PAYMENT_IN_PROGRESS');
  });

  test('multiple keys for same order allowed after FAILED', async ({
    page,
    request,
    vnpayHelper,
    testUser,
    apiUrl,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /vnpay/i }).click();

    const firstPaymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();

    const firstPaymentResponse = await firstPaymentPromise;
    const firstPaymentData = enrichVnpayPaymentResponse(undefined, firstPaymentResponse);
    const { gatewayReference: ref1, orderId, amount } = firstPaymentData.data;

    await vnpayHelper.simulateIpn(request, {
      gatewayReference: ref1,
      amount: BigInt(amount),
      responseCode: '07',
      transactionStatus: '02',
    });

    await page.waitForTimeout(2000);

    const secondKey = randomUUID();
    const secondPaymentResponse = await request.post(apiUrl + '/payments', {
      data: { orderId, method: 'VNPAY' },
      headers: {
        Authorization: 'Bearer ' + testUser.accessToken,
        'Idempotency-Key': secondKey,
      },
    });

    expect(secondPaymentResponse.ok()).toBeTruthy();
    const secondPaymentData = await secondPaymentResponse.json();
    expect(secondPaymentData.data.status).toBe('PROCESSING');
  });
});
