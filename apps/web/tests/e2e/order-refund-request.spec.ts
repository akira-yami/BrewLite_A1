import { expect, test, type Page } from '@playwright/test';

const order = {
  id: '52f7af5b-bea6-433c-892c-689f169d9327', orderNumber: 'ORD-REFUND-TEST',
  status: 'PAID', total: 45000, subtotal: 45000, discountAmount: 0, currency: 'VND',
  createdAt: '2026-11-17T09:00:00Z', updatedAt: '2026-11-17T09:00:00Z', items: [],
};

async function mockSession(page: Page, role: 'CUSTOMER' | 'BARISTA') {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  await page.addInitScript(token => localStorage.setItem('brewlite_token', token), `e30.${payload}.test`);
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: {
    data: { id: role, username: role.toLowerCase(), role, isActive: true },
  } }));
}

for (const decision of ['APPROVED', 'REJECTED'] as const) {
  test(`customer sees the ${decision} refund decision from the barista board`, async ({ page, browser, baseURL }) => {
    const reason = 'Khách xác nhận tiếp tục đơn';
    let status: 'PENDING' | typeof decision | null = null;
    const refundRequest = () => status && ({
      status, requestedAt: order.createdAt, decidedAt: status === 'PENDING' ? null : order.createdAt,
      rejectionReason: status === 'REJECTED' ? reason : null, points: order.total,
    });
    const detail = () => ({ ...order, status: status === 'APPROVED' ? 'CANCELLED' : 'PAID', refundRequest: refundRequest() });

    await mockSession(page, 'CUSTOMER');
    await page.route(`**/api/v1/orders/${order.id}`, route => route.fulfill({ json: { data: detail() } }));
    await page.route(`**/api/v1/orders/${order.id}/refund-request`, route => {
      expect(route.request().method()).toBe('POST');
      status = 'PENDING';
      return route.fulfill({ json: { data: refundRequest() } });
    });

    await page.goto(`/orders/confirmation?orderId=${order.id}`);
    await page.getByRole('button', { name: 'Yêu cầu hoàn tiền' }).click();
    await page.getByRole('button', { name: 'Xác nhận gửi yêu cầu' }).click();
    await expect(page.getByText('Đang chờ barista duyệt')).toBeVisible();

    const staff = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 } });
    try {
      await mockSession(staff, 'BARISTA');
      await staff.route('**/api/v1/staff/orders', route => route.fulfill({ json: {
        data: status === 'APPROVED' ? [] : [detail()],
      } }));
      await staff.route(`**/api/v1/staff/orders/${order.id}/refund-request`, route => {
        expect(route.request().method()).toBe('PATCH');
        expect(route.request().postDataJSON()).toEqual(decision === 'APPROVED' ? { decision } : { decision, reason });
        status = decision;
        return route.fulfill({ json: { data: refundRequest() } });
      });
      await staff.goto('/barista');
      const card = staff.getByRole('article', { name: `Đơn ${order.orderNumber}` });
      await expect(card.getByRole('button', { name: 'Nhận đơn' })).toBeDisabled();
      if (decision === 'APPROVED') {
        await card.getByRole('button', { name: 'Duyệt hoàn điểm' }).click();
        await card.getByRole('button', { name: 'Xác nhận hoàn điểm' }).click();
        await expect(staff.getByText(/Đã hủy đơn .* và hoàn/)).toBeVisible();
        await expect(card).toHaveCount(0);
      } else {
        await card.getByRole('button', { name: 'Từ chối', exact: true }).click();
        const confirm = card.getByRole('button', { name: 'Xác nhận từ chối' });
        await expect(confirm).toBeDisabled();
        await card.getByLabel('Lý do từ chối gửi cho khách').fill(reason);
        await confirm.click();
        await expect(card.getByRole('button', { name: 'Nhận đơn' })).toBeEnabled();
        await expect(staff.getByText(/Đã từ chối yêu cầu hoàn tiền của đơn/)).toBeVisible();
      }
    } finally {
      await staff.close();
    }

    await page.bringToFront();
    if (decision === 'APPROVED') {
      await expect(page.getByText('Đã hoàn 45.000 điểm Loyalty')).toBeVisible({ timeout: 12000 });
      await page.route('**/api/v1/loyalty/tiers', route => route.fulfill({ json: { data: [] } }));
      await page.route('**/api/v1/loyalty/me', route => route.fulfill({ json: { data: {
        pointsBalance: 45000, availableCoupons: [], transactions: [
          { type: 'REFUND_CREDIT', points: 45000, reason: 'Hoàn tiền đơn hàng', balanceAfter: 45000, createdAt: order.createdAt, orderNumber: order.orderNumber },
        ],
      } } }));
      await page.getByRole('link', { name: 'Xem lịch sử điểm Loyalty' }).click();
      await expect(page.getByText('+45.000', { exact: false })).toBeVisible();
    } else {
      await expect(page.getByText('Yêu cầu hoàn tiền bị từ chối')).toBeVisible({ timeout: 12000 });
      await page.goto(`/orders/${order.id}`);
      await expect(page.getByText(reason)).toBeVisible();
    }
  });
}
