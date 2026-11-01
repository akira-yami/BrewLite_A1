import { defineConfig, devices } from '@playwright/test';

// Dùng port riêng; không vô tình kiểm tra server dev đang chạy trên 3000/3001.
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
  webServer: [
    {
      command: 'npm --prefix ../api run start:prod',
      url: 'http://localhost:3101/api/v1/health',
      env: { PORT: '3101', WEB_ORIGIN: 'http://localhost:3100', MOCK_PAYMENT_MODE: 'deterministic' },
      reuseExistingServer: false,
    },
    {
      command: 'npm run start -- --port 3100',
      url: 'http://localhost:3100/menu',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
