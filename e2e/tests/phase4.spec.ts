/**
 * Phase-4 acceptance walkthrough (Phase-4 BRD §11). Requires the compose
 * stack (editor :8081, backend :8080). Covers: refresh-resilient sessions
 * (FR4-1..4), pinned-version resume across a publish, the editor draft
 * preview (FR4-5..8), the responses browser + hard delete (FR4-9/10),
 * questionnaire export/import (FR4-11/12), CSV export with the
 * formula-injection guard (FR4-15..17), the labels override (FR4-13), and the
 * completion redirect (FR4-18).
 */
import { expect, test, type Page } from '@playwright/test';
import { EXAMPLE_URL, routeExample } from './plain-html-example';

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:8080';
const EDITOR = process.env['EDITOR_URL'] ?? 'http://localhost:8081';

const STAMP = Date.now();
const NAME = `Phase4 Intake ${STAMP}`;

const ALWAYS = { mode: 'ALWAYS' };
const NEVER = { mode: 'NEVER' };

const q = (code: string, type: string, prompt: string, typeConfig: object, extra: object = {}) => ({
  id: `id-${code}`,
  code,
  sectionTitle: '',
  prompt,
  type,
  width: 'DEFAULT',
  typeConfig,
  visibility: ALWAYS,
  requirement: NEVER,
  ...extra,
});

const definitionV1 = {
  schemaVersion: 2,
  steps: [
    {
      id: 'step-1',
      title: 'About',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        q('food1', 'TEXT_BOX', 'what is your favorite food?', { size: 'MEDIUM', maxLength: null }, { requirement: ALWAYS }),
        q('toppings', 'CHECKBOX', 'pick toppings', {
          options: [
            { id: 'o1', label: 'Mushroom' },
            { id: 'o2', label: 'Onion' },
            { id: 'o3', label: 'Pepper' },
          ],
          maxSelections: null,
        }),
        q('newsletter', 'TOGGLE', 'subscribe to updates?', { trueLabel: 'Yes', falseLabel: 'No' }),
        q('partySize', 'NUMBER', 'party size', { min: null, max: null, decimalPlaces: 0, adornment: 'NONE', currencySymbol: '$' }),
        q('attachment', 'FILE_UPLOAD', 'attach a document', {
          allowedCategories: ['DOCUMENTS'], maxFiles: 2, maxFileSizeMb: 10, helperText: '',
        }),
      ],
    },
    {
      id: 'step-2',
      title: 'Wrap up',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        q('finalNotes', 'TEXT_BOX', 'anything else?', { size: 'MEDIUM', maxLength: null }),
        q('homeAddr', 'ADDRESS', 'Home address', {
          enabledFields: { line2: true, state: true, postalCode: true },
          requiredFields: {},
          defaultCountry: 'US',
          autocomplete: false,
        }),
      ],
    },
  ],
  tabs: [],
  questions: [],
};

/** v2 = v1 with a changed food1 prompt — enough to tell the versions apart. */
const definitionV2 = JSON.parse(JSON.stringify(definitionV1)) as typeof definitionV1;
definitionV2.steps[0].questions[0].prompt = 'what is your favorite meal?';

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\ntrailer<</Size 3/Root 1 0 R>>\n%%EOF\n',
);
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: PDF_BYTES });

const LANDING_PATH = `/phase4-landed-${STAMP}.html`;

/**
 * Serves the plain-html example (FR6-10) on a REAL editor-origin URL (route
 * interception) so page.reload() re-serves it — a hard refresh, which
 * setContent cannot simulate. An init script records fe-resumed /
 * fe-completed events.
 */
async function serveEmbed(page: Page, publicId: string, extraAttrs = ''): Promise<void> {
  await routeExample(page, publicId, extraAttrs);
  await page.addInitScript(() => {
    const w = window as unknown as { __resumed: unknown[]; __completed: unknown[] };
    w.__resumed = [];
    w.__completed = [];
    document.addEventListener('fe-resumed', (e) => w.__resumed.push((e as CustomEvent).detail));
    document.addEventListener('fe-completed', (e) => w.__completed.push((e as CustomEvent).detail));
  });
  await page.goto(EXAMPLE_URL);
}

const resumedEvents = (page: Page) =>
  page.evaluate(() => (window as unknown as { __resumed: unknown[] }).__resumed);

const sessionEntry = (page: Page, publicId: string) =>
  page.evaluate(
    ([backend, id]) => window.sessionStorage.getItem(`forms-engine:${backend}|${id}`),
    [BACKEND, publicId] as const,
  );

async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  const response = await fetch(`${BACKEND}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: (text ? JSON.parse(text) : undefined) as T };
}

test.describe.serial('Phase-4 acceptance walkthrough (§11)', () => {
  let questionnaireId: string;
  let publicId: string;
  let completedResponseId: string;

  test('0. setup: create + publish v1 via the management API', async () => {
    const created = await api<{ id: string; publicId: string }>('POST', '/api/v1/questionnaires', { name: NAME });
    expect(created.status).toBe(201);
    questionnaireId = created.json.id;
    publicId = created.json.publicId;
    expect((await api('PUT', `/api/v1/questionnaires/${questionnaireId}/draft`, definitionV1)).status).toBe(200);
    expect((await api('POST', `/api/v1/questionnaires/${questionnaireId}/publish`, { note: 'v1' })).status).toBe(200);
  });

  test('1. refresh resumes answers, position and the uploaded file row (§11.1)', async ({ page }) => {
    await serveEmbed(page, publicId);
    const engine = page.locator('forms-engine');
    await expect(engine.getByText('what is your favorite food?')).toBeVisible();

    await engine.locator('[data-code="food1"] input').fill('pizza');
    await engine.getByText('Mushroom').click();
    await engine.getByText('Onion').click();
    await engine.locator('[data-code="newsletter"]').getByRole('button', { name: 'Yes' }).click();
    await engine.locator('[data-code="partySize"] input').fill('4');
    await engine.locator('[data-code="attachment"] input[type="file"]').setInputFiles(pdf('resume.pdf'));
    // Wait for the upload's terminal SUCCESS row (the in-flight row also shows
    // the filename, and an in-flight upload rightly blocks Next per FR3-18).
    await expect(engine.getByRole('button', { name: 'Remove resume.pdf' })).toBeVisible();

    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await engine.getByRole('button', { name: 'Next' }).click();
    await expect(engine.getByText('anything else?')).toBeVisible();
    await patched;

    // FR4-1: the sessionStorage entry exists the moment the response does.
    const entry = await sessionEntry(page, publicId);
    expect(entry).not.toBeNull();
    completedResponseId = (JSON.parse(entry!) as { responseId: string }).responseId;

    // Hard refresh (§11.1) → fe-resumed, position + answers + file row intact.
    await page.reload();
    await expect(engine.getByText('anything else?')).toBeVisible();
    const resumed = (await resumedEvents(page)) as { responseId: string }[];
    expect(resumed).toHaveLength(1);
    expect(resumed[0].responseId).toBe(completedResponseId);

    await engine.getByRole('button', { name: 'Back' }).click();
    await expect(engine.locator('[data-code="food1"] input')).toHaveValue('pizza');
    await expect(engine.locator('.fe-upload-row', { hasText: 'resume.pdf' })).toBeVisible();
    // The restored row keeps its remove control (FR4-3).
    await expect(
      engine.locator('.fe-upload-row').getByRole('button', { name: 'Remove resume.pdf' }),
    ).toBeVisible();

    // Finish with a formula-looking answer (CSV guard fodder, §11.7) and an address.
    await engine.getByRole('button', { name: 'Next' }).click();
    await engine.locator('[data-code="finalNotes"] input').fill('=1+1');
    const addr = engine.locator('[data-code="homeAddr"]');
    await addr.locator('input[id$="-line1"]').fill('12 Main St');
    await addr.locator('input[id$="-city"]').fill('Woodbury');
    await addr.locator('[id$="-state"]').click();
    await engine.getByRole('option', { name: 'New Jersey' }).click();
    await addr.locator('input[id$="-postalCode"]').fill('08096');
    await engine.getByRole('button', { name: 'Finish' }).click();
    await expect(engine.getByText('Thank you!')).toBeVisible();

    // Completion clears the entry; the next refresh starts a fresh session.
    expect(await sessionEntry(page, publicId)).toBeNull();
    await page.reload();
    await expect(engine.getByText('what is your favorite food?')).toBeVisible();
    await expect(engine.locator('[data-code="food1"] input')).toHaveValue('');
  });

  test('2. persist-session="false" restores the Phase-3 behavior (§11.1)', async ({ page }) => {
    await serveEmbed(page, publicId, 'persist-session="false"');
    const engine = page.locator('forms-engine');
    await engine.locator('[data-code="food1"] input').fill('sushi');
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await engine.getByRole('button', { name: 'Next' }).click();
    await patched;
    expect(await sessionEntry(page, publicId)).toBeNull();
    await page.reload();
    await expect(engine.locator('[data-code="food1"] input')).toHaveValue('');
    expect(await resumedEvents(page)).toHaveLength(0);
  });

  test('3. a server-side response delete resets the refreshed session cleanly (§11.1, FR4-9)', async ({ page }) => {
    await serveEmbed(page, publicId);
    const engine = page.locator('forms-engine');
    await engine.locator('[data-code="food1"] input').fill('tacos');
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await engine.getByRole('button', { name: 'Next' }).click();
    await patched;
    const responseId = (JSON.parse((await sessionEntry(page, publicId))!) as { responseId: string }).responseId;

    // Erasure request lands while the tab is open (FR4-9); 204 then 404.
    expect((await api('DELETE', `/api/v1/questionnaires/${questionnaireId}/responses/${responseId}`)).status).toBe(204);
    expect((await api('DELETE', `/api/v1/questionnaires/${questionnaireId}/responses/${responseId}`)).status).toBe(404);

    // Next refresh: the 404 clears the stored id and starts fresh — no error.
    await page.reload();
    await expect(engine.getByText('what is your favorite food?')).toBeVisible();
    await expect(engine.locator('[data-code="food1"] input')).toHaveValue('');
    expect(await sessionEntry(page, publicId)).toBeNull();
  });

  test('4. a refreshed session resumes on its pinned version while fresh tabs get v2 (§11.2)', async ({ page }) => {
    await serveEmbed(page, publicId);
    const engine = page.locator('forms-engine');
    await expect(engine.getByText('what is your favorite food?')).toBeVisible();
    await engine.locator('[data-code="food1"] input').fill('v1 answer');
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await engine.getByRole('button', { name: 'Next' }).click();
    await patched;

    // Publish v2 (changed prompt) while the v1 session is open.
    expect((await api('PUT', `/api/v1/questionnaires/${questionnaireId}/draft`, definitionV2)).status).toBe(200);
    expect((await api('POST', `/api/v1/questionnaires/${questionnaireId}/publish`, { note: 'v2' })).status).toBe(200);

    // Refresh → the pinned v1 definition is served from the response payload.
    await page.reload();
    await expect(engine.getByText('anything else?')).toBeVisible();
    await engine.getByRole('button', { name: 'Back' }).click();
    await expect(engine.getByText('what is your favorite food?')).toBeVisible();
    await expect(engine.locator('[data-code="food1"] input')).toHaveValue('v1 answer');

    // A fresh tab (its own sessionStorage) gets the live v2.
    const fresh = await page.context().newPage();
    await serveEmbed(fresh, publicId);
    await expect(fresh.locator('forms-engine').getByText('what is your favorite meal?')).toBeVisible();
    await fresh.close();
  });

  test('5. CSV export: BOM, derived columns, flattening, formula guard (§11.7)', async ({ request }) => {
    const response = await request.get(
      `${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses/export.csv?versionNumber=1`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    const body = await response.body();
    // UTF-8 BOM for Excel (FR4-15).
    expect([body[0], body[1], body[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = body.toString('utf8').replace(/^﻿/, '');
    const [header, ...rows] = text.trim().split(/\r?\n/);
    // Meta columns first (externalRef between responseId and status since
    // Phase 5, FR5-3), then reading order; ADDRESS expands to enabled
    // sub-fields (FR4-16).
    expect(header).toBe(
      'responseId,externalRef,status,versionNumber,createdAt,completedAt,' +
        'food1,toppings,newsletter,partySize,attachment,finalNotes,' +
        'homeAddr.country,homeAddr.line1,homeAddr.line2,homeAddr.city,homeAddr.state,homeAddr.postalCode',
    );
    const completedRow = rows.find((r) => r.startsWith(completedResponseId));
    expect(completedRow).toBeTruthy();
    expect(completedRow).toContain('pizza');
    expect(completedRow).toContain('Mushroom; Onion');
    expect(completedRow).toContain('true');
    expect(completedRow).toContain(',4,');
    expect(completedRow).toContain('resume.pdf');
    // FR4-17: the respondent's `=1+1` arrives quoted as text.
    expect(completedRow).toContain("'=1+1");
    expect(completedRow).not.toContain(',=1+1');
    expect(completedRow).toContain('NJ');
    expect(completedRow).toContain('08096');
  });

  test('6. responses browser: filters, raw JSON, typed hard delete with file cascade (§11.4)', async ({ page }) => {
    await page.goto(`/q/${questionnaireId}`);
    await page.getByRole('button', { name: 'Responses' }).click();
    await page.waitForURL(/\/responses$/);

    // All three surviving responses (1 completed, 2 in-progress), newest first.
    await expect(page.locator('tbody tr.row')).toHaveCount(3);

    // Status filter.
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Completed' }).click();
    await expect(page.locator('tbody tr.row')).toHaveCount(1);
    await expect(page.locator('tbody tr.row td', { hasText: 'v1' }).first()).toBeVisible();

    // The completed row shows answered + file counts derived from answers.
    const row = page.locator('tbody tr.row').first();
    await expect(row.getByText('7', { exact: true })).toBeVisible();
    await expect(row.getByText('1', { exact: true })).toBeVisible();

    // Row expansion: pretty-printed raw answers.
    await row.click();
    await expect(page.locator('pre')).toContainText('"food1": "pizza"');
    await expect(page.locator('.raw-meta')).toContainText(completedResponseId);

    // Version filter shows all v1 rows.
    await page.getByLabel('Version').click();
    await page.getByRole('option', { name: 'v1', exact: true }).click();
    await expect(page.locator('tbody tr.row')).toHaveCount(1);

    // Typed hard delete stating the file cascade (FR4-9/10, P4-D7).
    await row.getByRole('button', { name: 'Delete response' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('1 uploaded file')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete response' })).toBeDisabled();
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
    await dialog.getByRole('button', { name: 'Delete response' }).click();
    await expect(page.getByText('Response deleted')).toBeVisible();
    await expect(page.locator('tbody tr.row')).toHaveCount(0);

    // The public rehydration GET now 404s — the sessionStorage reset signal.
    expect((await api('GET', `/public/v1/responses/${completedResponseId}`)).status).toBe(404);
  });

  test('7. export / import round trip + corrupted-file rejection (§11.5)', async ({ page }) => {
    await page.goto('/');
    const rowMenu = page
      .locator('tr.row', { hasText: NAME })
      .getByRole('button', { name: 'Questionnaire actions' });
    await rowMenu.click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Export' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const envelope = JSON.parse(readFileSync(path!, 'utf8')) as Record<string, unknown>;
    expect(envelope['formsEngineExport']).toBe(1);
    expect(envelope['name']).toBe(NAME);
    expect(envelope['definition']).toBeTruthy();
    // P4-D3: environment-specific data is deliberately excluded.
    expect(envelope['publicId']).toBeUndefined();
    expect(envelope['allowedOrigins']).toBeUndefined();

    // Import the same file → NEW questionnaire, name suffixed on collision.
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(path!);
    await expect(page.getByText(`Imported "${NAME} (imported)"`)).toBeVisible();
    const importedRow = page.locator('tr.row', { hasText: `${NAME} (imported)` });
    await expect(importedRow).toBeVisible();
    await expect(importedRow.getByText('never published')).toBeVisible();

    // Corrupted envelope → blocking error dialog, nothing created.
    const badChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import' }).click();
    const badChooser = await badChooserPromise;
    await badChooser.setFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...envelope, formsEngineExport: 99 })),
    });
    const errorDialog = page.getByRole('dialog');
    await expect(errorDialog.getByText('Import failed')).toBeVisible();
    await expect(errorDialog.getByText(/formsEngineExport/)).toBeVisible();
    await errorDialog.getByRole('button', { name: 'OK' }).click();
  });

  test('8. draft preview: real renderer, in-memory, zero responses, upload tag, Reset (§11.3)', async ({ page }) => {
    // A draft-only questionnaire — preview must work WITHOUT publishing.
    // Its upload question is REQUIRED so in-memory satisfaction is proven.
    const draftDefinition = JSON.parse(JSON.stringify(definitionV1)) as typeof definitionV1;
    draftDefinition.steps[0].questions[4].requirement = ALWAYS;
    const created = await api<{ id: string }>('POST', '/api/v1/questionnaires', { name: `${NAME} Draft` });
    const draftId = created.json.id;
    expect((await api('PUT', `/api/v1/questionnaires/${draftId}/draft`, draftDefinition)).status).toBe(200);

    await page.goto(`/q/${draftId}`);
    await page.getByRole('button', { name: 'Preview' }).click();
    const overlay = page.locator('app-preview-overlay');
    const engine = overlay.locator('forms-engine');
    await expect(engine.getByText('what is your favorite food?')).toBeVisible();
    await expect(overlay.getByText('never uploaded', { exact: false })).toBeVisible();

    // Gating runs exactly as live (FR4-6).
    await engine.getByRole('button', { name: 'Next' }).click();
    await expect(engine.getByText('This question is required.').first()).toBeVisible();
    await engine.locator('[data-code="food1"] input').fill('preview pizza');

    // FR4-7: required-upload gating satisfiable in-memory, tagged, nothing sent.
    await engine.getByRole('button', { name: 'Next' }).click();
    await expect(
      engine.locator('[data-code="attachment"]').getByText('This question is required.'),
    ).toBeVisible();
    await engine.locator('[data-code="attachment"] input[type="file"]').setInputFiles(pdf('draft.pdf'));
    await expect(engine.locator('.fe-upload-row', { hasText: 'draft.pdf' })).toBeVisible();
    await expect(engine.getByText('preview — not uploaded')).toBeVisible();

    await engine.getByRole('button', { name: 'Next' }).click();
    await expect(engine.getByText('anything else?')).toBeVisible();
    await engine.getByRole('button', { name: 'Finish' }).click();
    await expect(engine.getByText('Thank you!')).toBeVisible();

    // Reset restarts clean at the first screen (FR4-6/8).
    await overlay.getByRole('button', { name: 'Reset' }).click();
    await expect(engine.getByText('what is your favorite food?')).toBeVisible();
    await expect(engine.locator('[data-code="food1"] input')).toHaveValue('');

    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();

    // Zero responses and zero uploads were created during the whole preview.
    const responses = await api<{ total: number }>('GET', `/api/v1/questionnaires/${draftId}/responses`);
    expect(responses.json.total).toBe(0);
    const stats = await api<{ fileCount: number }>('GET', `/api/v1/questionnaires/${draftId}/files/stats`);
    expect(stats.json.fileCount).toBe(0);
  });

  test('9. labels override + completion redirect ordering and scheme check (§11.6/8)', async ({ page }) => {
    await page.route(`${EDITOR}${LANDING_PATH}`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body><h1>REDIRECT LANDED</h1></body></html>' }),
    );
    const labels = JSON.stringify({ requiredError: 'Este campo es obligatorio', finish: 'Enviar' });
    await serveEmbed(
      page,
      publicId,
      `labels='${labels}' completion-redirect="${EDITOR}${LANDING_PATH}"`,
    );
    const engine = page.locator('forms-engine');
    await expect(engine.getByText('what is your favorite meal?')).toBeVisible();

    // Overridden keys render; everything else falls back to English (FR4-13).
    await engine.getByRole('button', { name: 'Next' }).click();
    await expect(engine.getByText('Este campo es obligatorio')).toBeVisible();
    await expect(engine.getByRole('button', { name: 'Next' })).toBeVisible();

    await engine.locator('[data-code="food1"] input').fill('labelled');
    await engine.getByRole('button', { name: 'Next' }).click();
    await expect(engine.getByText('anything else?')).toBeVisible();

    // FR4-18/P4-D6: fe-completed first, then the top-window navigation.
    await engine.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForURL(`${EDITOR}${LANDING_PATH}`);
    await expect(page.getByText('REDIRECT LANDED')).toBeVisible();

    // javascript: scheme is inert — console warning, no navigation.
    const warnings: string[] = [];
    const page2 = await page.context().newPage();
    page2.on('console', (message) => {
      if (message.type() === 'warning') {
        warnings.push(message.text());
      }
    });
    await serveEmbed(page2, publicId, `completion-redirect="javascript:alert(1)"`);
    const engine2 = page2.locator('forms-engine');
    await engine2.locator('[data-code="food1"] input').fill('scheme check');
    await engine2.getByRole('button', { name: 'Next' }).click();
    await expect(engine2.getByText('anything else?')).toBeVisible();
    await engine2.getByRole('button', { name: 'Finish' }).click();
    await expect(engine2.getByText('Thank you!')).toBeVisible();
    expect(warnings.some((w) => w.includes('completion-redirect ignored'))).toBe(true);
    expect(page2.url()).toBe(EXAMPLE_URL);
    await page2.close();
  });
});
