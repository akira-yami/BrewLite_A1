import { randomUUID } from 'node:crypto';
import { expect, test } from './fixtures/vnpay-fixtures';
import { addFirstAvailableProduct, proceedToCheckout } from './helpers/cart-helper';
import { enrichVnpayPaymentResponse } from './helpers/vnpay-test-helper';

const api = process.env.E2E_API_URL ?? 'http://localhost:3101/api/v1';
const tierPoints = 10000;
const discount = 10000;

test.skip(Boolean(process.env.E2E_EXTERNAL_BASE_URL), 'Requires the isolated payment gateways');

test('customer redeems earned points and pays a discounted order with the voucher', async ({ page, request, testUser, vnpayHelper }) => {
  const headers = { Authorization: `Bearer ${testUser.accessToken}` };
  const catalog = await request.get(`${api}/products`);
  expect(catalog.ok()).toBeTruthy();
  const { data: products } = await catalog.json();
  const product = products.find((item: { sku: string }) => item.sku === 'COFFEE-CAU-DAT-01');
  expect(product).toBeDefined();
  const variant = product.variants.find((item: { size: string }) => item.size === 'M');
  expect(variant).toBeDefined();

  const earningOrder = await request.post(`${api}/orders`, {
    headers,
    data: { items: [{ productVariantId: variant.id, quantity: Math.ceil(tierPoints * 10 / variant.price) }] },
  });
  expect(earningOrder.status()).toBe(201);
  const { data: earnedFrom } = await earningOrder.json();
  const earnedPayment = await request.post(`${api}/payments`, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { orderId: earnedFrom.id, method: 'E_WALLET' },
  });
  expect(earnedPayment.ok()).toBeTruthy();
  expect((await earnedPayment.json()).data.status).toBe('SUCCEEDED');
  const initialPoints = Math.floor(earnedFrom.total / 10);

  await page.goto('/login');
  await page.evaluate(token => localStorage.setItem('brewlite_token', token), testUser.accessToken);
  await page.goto('/loyalty');
  const reward = page.getByRole('article').filter({ hasText: 'Đổi 10.000 điểm' });
  const redeemButton = reward.getByRole('button', { name: 'Đổi điểm', exact: true });
  await expect(redeemButton).toBeEnabled();
  const [redeemed] = await Promise.all([
    page.waitForResponse(response => response.url() === `${api}/loyalty/redeem`
      && response.request().method() === 'POST'),
    redeemButton.click(),
  ]);
  expect(redeemed.ok()).toBeTruthy();
  const { data: { coupon: { code } } } = await redeemed.json();
  await expect(page.getByText(`Đã đổi 10.000 điểm. Mã voucher: ${code}`)).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: code }).getByRole('button', { name: 'Dùng voucher' }).click();
  await page.waitForURL(/\/menu$/, { timeout: 15_000 });

  const [quoted] = await Promise.all([
    page.waitForResponse(response => response.url() === `${api}/coupons/validate`
      && response.request().method() === 'POST' && response.request().postDataJSON().code === code),
    addFirstAvailableProduct(page),
  ]);
  expect(quoted.ok()).toBeTruthy();
  expect((await quoted.json()).data.discountAmount).toBe(discount);
  await expect(page.getByRole('button', { name: 'Xóa mã' })).toBeVisible();
  await proceedToCheckout(page);
  await expect(page.getByText(`Giảm giá (${code})`)).toBeVisible();

  const [payment] = await Promise.all([
    page.waitForResponse(response => response.url() === `${api}/payments`
      && response.request().method() === 'POST'),
    page.getByRole('button', { name: /^Thanh toán / }).click(),
  ]);
  const { data: { orderId, gatewayReference, amount } } = enrichVnpayPaymentResponse(undefined, payment);
  expect((await vnpayHelper.simulateIpn(request, {
    gatewayReference, amount: BigInt(amount), responseCode: '00', transactionStatus: '00',
  })).RspCode).toBe('00');
  await expect(page).toHaveURL(new RegExp(`/orders/confirmation\\?orderId=${orderId}`));

  const paidOrder = await request.get(`${api}/orders/${orderId}`, { headers });
  expect(paidOrder.ok()).toBeTruthy();
  const { data: order } = await paidOrder.json();
  expect(order).toMatchObject({ status: 'PAID', discountAmount: discount, total: order.subtotal - discount });
  expect(Number(amount)).toBe(order.total);
  const loyalty = await request.get(`${api}/loyalty/me`, { headers });
  expect(loyalty.ok()).toBeTruthy();
  const { data: overview } = await loyalty.json();
  expect(overview.availableCoupons).not.toContainEqual(expect.objectContaining({ code }));
  expect(overview.pointsBalance).toBe(initialPoints - tierPoints + Math.floor(order.total / 10));
});
