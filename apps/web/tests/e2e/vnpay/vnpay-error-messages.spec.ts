import { enrichVnpayPaymentResponse } from '../helpers/vnpay-test-helper.js';
import { test, expect } from '../fixtures/vnpay-fixtures.js';
import { setupCartWithProduct, proceedToCheckout } from '../helpers/cart-helper.js';

test.describe('Vietnamese Error Messages', () => {
  test('insufficient balance error displays in Vietnamese', async ({
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

    await page.waitForTimeout(2000);

    const errorMessage = page.getByText(/số dư|hạn mức/i);
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test('timeout message displays in Vietnamese', async ({
    page,
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
    await paymentPromise;

    await page.waitForTimeout(3000);

    const timeoutText = page.getByText(/thời gian|giữ chỗ/i);
    const hasVietnameseText = await timeoutText.count();
    expect(hasVietnameseText).toBeGreaterThan(0);
  });

  test('amount formatting with thousand separators', async ({
    page,
    testUser,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);

    const amountText = await page
      .getByText(/\d{1,3}(\.\d{3})+/)
      .first()
      .textContent();

    expect(amountText).toMatch(/\d{1,3}(\.\d{3})+/);
  });

  test('payment instructions in Vietnamese', async ({
    page,
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
    await paymentPromise;

    const vietnameseInstructions = page.getByText(/quét|thanh toán|mã QR/i);
    const count = await vietnameseInstructions.count();
    expect(count).toBeGreaterThan(0);
  });

  test('all buttons labeled in Vietnamese', async ({
    page,
    testUser,
  }) => {
    await setupCartWithProduct(page, testUser.accessToken);
    await proceedToCheckout(page);

    const vnpayButton = page.getByRole('button', { name: /vnpay/i });
    await expect(vnpayButton).toBeVisible();

    await vnpayButton.click();

    const payButton = page.getByRole('button', { name: /^Thanh toán / });
    await expect(payButton).toBeVisible();

    const buttonText = await payButton.textContent();
    expect(buttonText).toMatch(/Thanh toán/);
  });
});
