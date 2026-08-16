/**
 * Phase-6 examples walkthrough (Phase-6 BRD §8.1): seeds the demo
 * questionnaire with the REAL seed script (FR6-7 — also a standing test of
 * the FR4-11/12 export/import format), then drives the plain-html example:
 * the required text box gates Next, the conditional-visibility rule fires
 * when the toggle flips (FR6-8), and completion logs fe-completed through the
 * example's own console logging (FR6-1). Requires the compose stack.
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { openExample } from './plain-html-example';

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:8080';
const SEED_SCRIPT = join(__dirname, '..', '..', 'examples', 'seed', 'seed.mjs');

test('seed script publishes the demo questionnaire; the plain-html example runs it', async ({ page }) => {
  const { stdout } = await promisify(execFile)('node', [SEED_SCRIPT, '--api-base', BACKEND]);
  const publicId = /publicId:\s*(\S+)/.exec(stdout)?.[1];
  expect(publicId, `seed output should contain a publicId:\n${stdout}`).toBeTruthy();

  const logs: string[] = [];
  page.on('console', (message) => logs.push(message.text()));

  await openExample(page, publicId!);
  const form = page.locator('forms-engine');

  // Step 1: the required text box gates Next (FR6-8 "demonstrate gating").
  await expect(form.getByText('What is your favorite food?')).toBeVisible();
  await form.getByRole('button', { name: 'Next' }).click();
  await expect(form.getByText('This question is required.')).toBeVisible();
  await form.getByLabel(/favorite food/).fill('pizza');
  await form.getByRole('button', { name: 'Next' }).click();

  // Step 2: the conditional-visibility rule fires on the toggle.
  await expect(form.getByText('Would you like dessert?')).toBeVisible();
  await expect(form.getByText('What is the best dessert?')).toBeHidden();
  await form.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(form.getByText('What is the best dessert?')).toBeVisible();
  await form.getByRole('radio', { name: 'Cake' }).check();

  await form.getByRole('button', { name: 'Finish' }).click();
  await expect(form.getByText('Thank you!')).toBeVisible();

  // FR6-1: the example logs the component's events to the console.
  expect(logs.some((line) => line.startsWith('fe-loaded'))).toBe(true);
  expect(logs.some((line) => line.startsWith('fe-screen-changed'))).toBe(true);
  expect(logs.some((line) => line.startsWith('fe-completed'))).toBe(true);
});
