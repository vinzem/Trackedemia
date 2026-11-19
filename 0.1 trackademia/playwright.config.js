import { defineConfig, devices } from '@playwright/test';

const API_PORT = 8788;
const AUTH_PORT = 8790;
const APP_PORT = 4173;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
    timezoneId: 'Asia/Manila',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } }, testIgnore: /mobile\.spec\.js/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.js/ },
  ],
  webServer: [
    {
      command: 'node tests/e2e/support/server.js',
      port: API_PORT,
      reuseExistingServer: false,
      env: { E2E_API_PORT: String(API_PORT), E2E_AUTH_PORT: String(AUTH_PORT), E2E_APP_URL: `http://localhost:${APP_PORT}` },
    },
    {
      command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${APP_PORT} --strictPort`,
      port: APP_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_SUPABASE_URL: `http://localhost:${AUTH_PORT}`,
        VITE_SUPABASE_ANON_KEY: 'anon',
        VITE_API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
