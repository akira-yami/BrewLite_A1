import { test as base } from '@playwright/test';
import { VnpayTestHelper } from '../helpers/vnpay-test-helper.js';
import { createTestUser, type TestUser } from '../helpers/auth-helper.js';

interface VnpayFixtures {
  vnpayHelper: VnpayTestHelper;
  testUser: TestUser;
  apiUrl: string;
}

export const test = base.extend<VnpayFixtures>({
  apiUrl: async ({}, use) => {
    const url = process.env.E2E_API_URL ?? 'http://localhost:3101/api/v1';
    await use(url);
  },

  vnpayHelper: async ({ apiUrl }, use) => {
    // Load VNPAY credentials from env
    const hashSecret = process.env.VNPAY_HASH_SECRET;
    const tmnCode = process.env.VNPAY_TMN_CODE;

    // Validate required env vars
    if (!hashSecret || !tmnCode) {
      throw new Error(
        'Missing required VNPAY credentials: VNPAY_HASH_SECRET and VNPAY_TMN_CODE must be set',
      );
    }

    // Create helper instance
    const helper = new VnpayTestHelper(apiUrl, hashSecret, tmnCode);
    await use(helper);
  },

  testUser: async ({ request, apiUrl }, use) => {
    // Create test user for this test
    const user = await createTestUser(request, apiUrl);
    await use(user);
    // No cleanup - preserve audit trail
  },
});

export { expect } from '@playwright/test';
