import { defineConfig } from '@playwright/test';

/**
 * Runs against a live self-hosted stack (FR-P-1): `docker compose up` first.
 * EDITOR_URL / BACKEND_URL override the defaults.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env['EDITOR_URL'] ?? 'http://localhost:8081',
    trace: 'retain-on-failure',
    // Use the signed, system-installed Chrome: Windows App Control (Smart App
    // Control) blocks Playwright's downloaded unsigned headless-shell binary.
    channel: 'chrome',
    launchOptions: {
      // Chrome's Local/Private Network Access checks block fetches to
      // localhost from route-fulfilled test pages (their address space is
      // "unknown", not loopback). Test-only relaxation.
      args: [
        '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
      ],
    },
  },
});
