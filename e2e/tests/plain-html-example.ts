/**
 * FR6-10 (P6-D4): the embed page every spec drives is the REAL
 * examples/plain-html/index.html — the artifact users copy — served on an
 * editor-origin URL via route interception (so page.reload() is a hard
 * refresh and the page's origin passes allowed-origin checks). Only the
 * config values the example tells users to edit (public-id, api-base) are
 * substituted; specs may append extra attributes (persist-session,
 * external-ref, labels, …) to the element, exactly as a user would.
 *
 * The example's relative module src (../../packages/renderer/dist/…)
 * resolves against the served URL to /packages/renderer/dist/…, which is
 * fulfilled from the workspace's freshly built bundle — the suite always
 * tests current source (`npm run build` first).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:8080';
const EDITOR = process.env['EDITOR_URL'] ?? 'http://localhost:8081';

const REPO_ROOT = join(__dirname, '..', '..');
const EXAMPLE_FILE = join(REPO_ROOT, 'examples', 'plain-html', 'index.html');
const BUNDLE_FILE = join(REPO_ROOT, 'packages', 'renderer', 'dist', 'forms-engine.esm.js');

export const EXAMPLE_URL = `${EDITOR}/examples/plain-html/index.html`;
const BUNDLE_URL = `${EDITOR}/packages/renderer/dist/forms-engine.esm.js`;

/** The example file with its two config values substituted (FR6-2). */
export function exampleHtml(publicId: string, extraAttrs = ''): string {
  let html = readFileSync(EXAMPLE_FILE, 'utf8')
    .replace('PASTE_PUBLIC_ID_HERE', publicId)
    .replace('api-base="http://localhost:8080"', `api-base="${BACKEND}"`);
  if (extraAttrs) {
    html = html.replace('<forms-engine', `<forms-engine ${extraAttrs}`);
  }
  return html;
}

/** Registers the routes only; navigate with `page.goto(EXAMPLE_URL)`. */
export async function routeExample(page: Page, publicId: string, extraAttrs = ''): Promise<void> {
  await page.route(EXAMPLE_URL, (route) =>
    route.fulfill({ contentType: 'text/html', body: exampleHtml(publicId, extraAttrs) }),
  );
  await page.route(BUNDLE_URL, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: readFileSync(BUNDLE_FILE, 'utf8') }),
  );
}

/** Route + navigate, for specs with no init-script needs. */
export async function openExample(page: Page, publicId: string, extraAttrs = ''): Promise<void> {
  await routeExample(page, publicId, extraAttrs);
  await page.goto(EXAMPLE_URL, { waitUntil: 'networkidle' });
}
