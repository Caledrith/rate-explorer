import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive the real stack (nginx, API, Postgres) started by `npm run e2e:up`,
// which loads the fixture rate file. They are the check that the pieces fit together.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
