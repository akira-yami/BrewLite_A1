/**
 * Validates required VNPAY environment variables
 * Throws descriptive error if credentials are missing or invalid
 */
export function validateVnpayEnv(): void {
  const required = {
    VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE,
    VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET,
    VNPAY_PAYMENT_URL: process.env.VNPAY_PAYMENT_URL,
    VNPAY_QUERY_URL: process.env.VNPAY_QUERY_URL,
  };

  // Check for missing variables
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required VNPAY credentials: ${missing.join(', ')}.\n` +
        `Copy .env.test.example to .env.test and fill in values from VNPAY Sandbox.`,
    );
  }

  // Validate HASH_SECRET length
  if (required.VNPAY_HASH_SECRET!.length !== 32) {
    throw new Error(
      `VNPAY_HASH_SECRET must be exactly 32 characters, got ${required.VNPAY_HASH_SECRET!.length}`,
    );
  }
}
