import { test, expect } from '../fixtures/vnpay-fixtures.js';
import { setupCartWithProduct, proceedToCheckout } from '../helpers/cart-helper.js';
import { assertCountdownVisible } from '../helpers/assertion-helper.js';

test.describe('VNPAY Timeout Recovery', () => {
  test('countdown timer displays correctly and enters urgent state', async ({
    page,
    testUser,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /VNPAY/ }).click();

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();
    await paymentPromise;

    await assertCountdownVisible(page, 'normal');

    const timerText = await page
      .locator('[role="status"]')
      .filter({ hasText: /\d{2}:\d{2}/ })
      .textContent();
    expect(timerText).toMatch(/\d{2}:\d{2}/);
  });

  test('manual recovery after payment completes late', async ({
    page,
    request,
    vnpayHelper,
    testUser,
    apiUrl,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /VNPAY/ }).click();

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();

    const paymentResponse = await paymentPromise;
    const paymentData = await paymentResponse.json();
    const { gatewayReference, orderId, amount } = paymentData.data;

    await page.waitForTimeout(3000);

    await vnpayHelper.simulateIpn(request, {
      gatewayReference,
      amount: BigInt(amount),
      responseCode: '00',
      transactionStatus: '00',
    });

    const recoveryButton = page.getByRole('button', {
      name: /Kiểm tra/,
    });

    if (await recoveryButton.isVisible({ timeout: 5000 })) {
      await recoveryButton.click();
    }

    await page.waitForURL(/\/orders\/confirmation\?orderId=/, {
      timeout: 20000,
    });

    const orderResponse = await request.get(apiUrl + '/orders/' + orderId, {
      headers: { Authorization: 'Bearer ' + testUser.accessToken },
    });
    const orderData = await orderResponse.json();
    expect(orderData.data.status).toBe('PAID');
  });

  test('recovery with payment failure shows error', async ({
    page,
    request,
    vnpayHelper,
    testUser,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /VNPAY/ }).click();

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();

    const paymentResponse = await paymentPromise;
    const paymentData = await paymentResponse.json();
    const { gatewayReference, amount } = paymentData.data;

    await vnpayHelper.simulateIpn(request, {
      gatewayReference,
      amount: BigInt(amount),
      responseCode: '07',
      transactionStatus: '02',
    });

    await page.waitForTimeout(2000);

    const errorAlert = page.getByRole('alert');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });

  test('countdown persists after page reload', async ({
    page,
    testUser,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);
    await page.getByRole('button', { name: /VNPAY/ }).click();

    const paymentPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/payments') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Thanh toán / }).click();
    await paymentPromise;

    await page.waitForTimeout(2000);

    const timerBefore = await page
      .locator('[role="status"]')
      .filter({ hasText: /\d{2}:\d{2}/ })
      .textContent();

    await page.reload();

    const timerAfter = await page
      .locator('[role="status"]')
      .filter({ hasText: /\d{2}:\d{2}/ })
      .textContent();

    expect(timerAfter).toBeTruthy();
    expect(timerAfter).toMatch(/\d{2}:\d{2}/);
  });
});
