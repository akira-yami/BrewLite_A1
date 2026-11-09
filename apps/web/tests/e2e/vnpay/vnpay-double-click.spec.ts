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

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();

    const paymentResponse = await paymentPromise;
    const idempotencyKey = paymentResponse.request().headers()['idempotency-key'];

    // After returning from VNPay, checkout automatically checks the existing
    // payment. A visible button is transient and must not be clicked after
    // the UI switches into its polling screen.
    const observedStatusKeys: string[] = [];
    let replayPosts = 0;
    page.on('request', (request) => {
      if (request.url().includes('/payments/status') && request.method() === 'GET') {
        observedStatusKeys.push(request.headers()['idempotency-key']);
      }
      if (request.url().endsWith('/payments') && request.method() === 'POST') {
        replayPosts += 1;
      }
    });

    // The payment POST initiates a browser redirect. Wait for the callback
    // landing page before reloading, otherwise Chromium can abort navigation.
    await page.waitForURL(/\/checkout\?paymentReturn=1/, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => observedStatusKeys.length, { timeout: 15000 }).toBeGreaterThan(0);
    expect(observedStatusKeys).toContain(idempotencyKey);
    expect(replayPosts, 'Reload should not create another payment attempt').toBe(0);
  });

  test('concurrent payment attempts return 409', async ({
    page,
    request,
    testUser,
    apiUrl,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);

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
