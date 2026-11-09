import { expect } from '@playwright/test';

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
