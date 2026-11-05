  import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT ?? 3100);
const apiPort = Number(process.env.E2E_API_PORT ?? 3101);
const webUrl = `http://localhost:${webPort}`;
const apiUrl = `http://localhost:${apiPort}`;

// Dùng port riêng; không vô tình kiểm tra server dev đang chạy trên 3000/3001.
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.E2E_EXTERNAL_BASE_URL ?? webUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
  webServer: process.env.E2E_EXTERNAL_BASE_URL ? undefined : [
    {
      command: 'npm --prefix ../api run start:dev',
      url: `${apiUrl}/api/v1/health`,
      env: { PORT: String(apiPort), WEB_ORIGIN: webUrl, MOCK_PAYMENT_MODE: 'deterministic' },
      reuseExistingServer: false,
    },
    {
      command: `npx next dev -p ${webPort}`,
      url: `${webUrl}/menu`,
      env: { NEXT_PUBLIC_API_URL: `${apiUrl}/api/v1` },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
