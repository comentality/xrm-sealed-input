// Runs the suite against the PCF test harness hosted by harness-server.mjs.
// Build the control first (cd ../SealedInput && npm run build).
import { defineConfig } from '@playwright/test';

const port = Number(process.env.HARNESS_PORT ?? 8183);

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './report' }]],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}/`,
    viewport: { width: 700, height: 600 },
    deviceScaleFactor: 2,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node harness-server.mjs',
    port,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
