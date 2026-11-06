import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export interface TestUser {
  username: string;
  password: string;
  accessToken: string;
  userId: string;
}

/**
 * Creates a test user with unique username via API registration
 *
 * @param request - Playwright APIRequestContext for making requests
 * @param apiUrl - Base API URL (e.g., 'http://localhost:3101/api/v1')
 * @param prefix - Username prefix (default: 'e2e_vnpay')
 * @returns TestUser object with credentials and access token
 * @throws Error if registration fails
 */
export async function createTestUser(
  request: APIRequestContext,
  apiUrl: string,
  prefix: string = 'e2e_vnpay',
): Promise<TestUser> {
  // Generate unique username: prefix + 16-char uuid (no dashes)
  const username = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const password = 'E2e-vnpay-password-123';

  // Register user via API
  const response = await request.post(`${apiUrl}/auth/register`, {
    data: { username, password },
  });

  // Check if registration succeeded
  if (!response.ok()) {
    throw new Error(`Failed to create test user: ${response.status()}`);
  }

  // Extract accessToken and userId from response
  const body = await response.json();
  const accessToken = body.data?.accessToken;
  const userId = body.data?.userId;

  if (!accessToken || !userId) {
    throw new Error('Registration response missing accessToken or userId');
  }

  return {
    username,
    password,
    accessToken,
    userId,
  };
}
