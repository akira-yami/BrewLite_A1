import { expect, type Page } from '@playwright/test';

/**
 * Assert countdown timer visibility and state
 *
 * @param page - Playwright Page instance
 * @param expectedState - Expected countdown state: 'normal', 'urgent', or 'expired'
 * @throws Error with descriptive message if assertion fails
 */
export async function assertCountdownVisible(
  page: Page,
  expectedState: 'normal' | 'urgent' | 'expired',
): Promise<void> {
  // Find countdown timer by role and format pattern
  const timer = page
    .locator('[role="status"]')
    .filter({ hasText: /\d{2}:\d{2}/ });

  if (expectedState === 'expired') {
    // When expired, expect the expired message
    await expect(page.getByText('Đã hết thời gian giữ chỗ')).toBeVisible({
      timeout: 5000,
    });
  } else if (expectedState === 'urgent') {
    // When urgent, expect red color and pulse animation
    await expect(timer).toBeVisible({ timeout: 5000 });

    // Check for urgent state classes
    const classList = await timer.getAttribute('class');
    expect(classList, 'Timer should have text-rose-600 class for urgent state').toContain(
      'text-rose-600',
    );
    expect(classList, 'Timer should have animate-pulse class for urgent state').toContain(
      'animate-pulse',
    );
  } else {
    // Normal state: visible but not urgent
    await expect(timer).toBeVisible({ timeout: 5000 });

    const classList = await timer.getAttribute('class');
    expect(
      classList?.includes('text-rose-600'),
      'Timer should NOT have text-rose-600 class in normal state',
    ).toBe(false);
  }
}

/**
 * Assert payment status by fetching order from API
 *
 * @param orderId - Order ID to check
 * @param expectedStatus - Expected payment status: 'PENDING' or 'PAID'
 * @param apiUrl - Base API URL (e.g., 'http://localhost:3101/api/v1')
 * @param accessToken - JWT access token for authorization
 * @throws Error with descriptive message if assertion fails
 */
export async function assertPaymentStatus(
  orderId: string,
  expectedStatus: 'PENDING' | 'PAID',
  apiUrl: string,
  accessToken: string,
): Promise<void> {
  // Fetch order details from API
  const response = await fetch(`${apiUrl}/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Assert response is successful
  expect(response.ok, `Failed to fetch order ${orderId}: ${response.status}`).toBeTruthy();

  // Parse response body
  const body = await response.json();

  // Assert payment status matches expected
  const actualStatus = body.data?.status;
  expect(actualStatus, `Order ${orderId} payment status mismatch`).toBe(expectedStatus);
}
