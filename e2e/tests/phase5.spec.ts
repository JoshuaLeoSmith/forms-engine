/**
 * Phase-5 acceptance walkthrough (Phase-5 BRD §9). Requires the compose
 * stack (editor :8081, backend :8080). Covers: external-ref correlation under
 * MULTIPLE (FR5-1/2/3), the ONE_PER_REF policy with the already-submitted and
 * config-error states (FR5-4/5/6/11), the spoofability demonstration (§9.2 —
 * deliberately observed, not just read), the sequential complete-race loser,
 * refresh-resume with a ref present, the no-in-progress-leak rule for
 * ref-status (FR5-9), and the new label overrides.
 */
import { expect, test, type Page } from '@playwright/test';
import { EXAMPLE_URL, routeExample } from './plain-html-example';

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:8080';

const STAMP = Date.now();
const NAME = `Phase5 Intake ${STAMP}`;

const ALWAYS = { mode: 'ALWAYS' };
const NEVER = { mode: 'NEVER' };

const definition = {
  schemaVersion: 2,
  steps: [
    {
      id: 'step-1',
      title: 'About',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        {
          id: 'id-food1',
          code: 'food1',
          sectionTitle: '',
          prompt: 'what is your favorite food?',
          type: 'TEXT_BOX',
          width: 'DEFAULT',
          typeConfig: { size: 'MEDIUM', maxLength: null },
          visibility: ALWAYS,
          requirement: ALWAYS,
        },
      ],
    },
    {
      id: 'step-2',
      title: 'Wrap up',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        {
          id: 'id-notes',
          code: 'notes',
          sectionTitle: '',
          prompt: 'anything else?',
          type: 'TEXT_BOX',
          width: 'DEFAULT',
          typeConfig: { size: 'MEDIUM', maxLength: null },
          visibility: ALWAYS,
          requirement: NEVER,
        },
      ],
    },
  ],
  tabs: [],
  questions: [],
};

/** Serves the plain-html example (FR6-10) on a real editor-origin URL; records the Phase-5 events. */
async function serveEmbed(page: Page, publicId: string, extraAttrs = ''): Promise<void> {
  await routeExample(page, publicId, extraAttrs);
  await page.addInitScript(() => {
    const w = window as unknown as { __alreadySubmitted: unknown[]; __errors: unknown[]; __completed: unknown[] };
    w.__alreadySubmitted = [];
    w.__errors = [];
    w.__completed = [];
    document.addEventListener('fe-already-submitted', (e) => w.__alreadySubmitted.push((e as CustomEvent).detail));
    document.addEventListener('fe-error', (e) => w.__errors.push((e as CustomEvent).detail));
    document.addEventListener('fe-completed', (e) => w.__completed.push((e as CustomEvent).detail));
  });
  await page.goto(EXAMPLE_URL);
}

const alreadySubmittedEvents = (page: Page) =>
  page.evaluate(() => (window as unknown as { __alreadySubmitted: unknown[] }).__alreadySubmitted);

const errorEvents = (page: Page) =>
  page.evaluate(() => (window as unknown as { __errors: unknown[] }).__errors);

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

/** Fills the two screens and finishes; expects the thank-you state. */
async function fillAndFinish(page: Page): Promise<void> {
  const engine = page.locator('forms-engine');
  await engine.locator('[data-code="food1"] input').fill('pizza');
  await engine.getByRole('button', { name: 'Next' }).click();
  await expect(engine.getByText('anything else?')).toBeVisible();
  await engine.getByRole('button', { name: 'Finish' }).click();
  await expect(engine.getByText('Thank you!')).toBeVisible();
}

const listByRef = (questionnaireId: string, ref: string, status = '') =>
  api<{ items: { responseId: string; externalRef: string | null; status: string }[]; total: number }>(
    'GET',
    `/api/v1/questionnaires/${questionnaireId}/responses?externalRef=${encodeURIComponent(ref)}${status ? `&status=${status}` : ''}`,
  );

test.describe.serial('Phase-5 acceptance walkthrough (§9)', () => {
  let questionnaireId: string;
  let publicId: string;

  test('0. setup: create + publish v1 via the management API', async () => {
    const created = await api<{ id: string; publicId: string; submissionPolicy: string }>(
      'POST', '/api/v1/questionnaires', { name: NAME });
    expect(created.status).toBe(201);
    expect(created.json.submissionPolicy).toBe('MULTIPLE');
    questionnaireId = created.json.id;
    publicId = created.json.publicId;
    expect((await api('PUT', `/api/v1/questionnaires/${questionnaireId}/draft`, definition)).status).toBe(200);
    expect((await api('POST', `/api/v1/questionnaires/${questionnaireId}/publish`, { note: 'v1' })).status).toBe(200);
  });

  test('1. MULTIPLE + ref: two submissions succeed; ref filter + CSV column (§9.1)', async ({ page }) => {
    for (let i = 0; i < 2; i++) {
      await serveEmbed(page, publicId, 'external-ref="user-4821"');
      await fillAndFinish(page);
      // Completion clears sessionStorage, so the next pass is a fresh session.
    }
    const both = await listByRef(questionnaireId, 'user-4821', 'COMPLETED');
    expect(both.json.total).toBe(2);
    expect(both.json.items.every((r) => r.externalRef === 'user-4821')).toBe(true);

    const csv = await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses/export.csv`);
    const csvText = await csv.text();
    expect(csvText).toContain('responseId,externalRef,status');
    expect(csvText).toContain('user-4821');
  });

  test('2. ONE_PER_REF: complete once, remount = already-submitted, new ref = spoofable (§9.2)', async ({ page }) => {
    expect((await api('PATCH', `/api/v1/questionnaires/${questionnaireId}`,
      { submissionPolicy: 'ONE_PER_REF' })).status).toBe(200);

    await serveEmbed(page, publicId, 'external-ref="invite-1"');
    await fillAndFinish(page);
    const { json: before } = await listByRef(questionnaireId, 'invite-1');

    // Remount → mount-time ref-status check renders already-submitted; no new response.
    await page.reload();
    const engine = page.locator('forms-engine');
    await expect(engine.getByText("You've already submitted this form.")).toBeVisible();
    expect(await alreadySubmittedEvents(page)).toEqual([{ externalRef: 'invite-1' }]);
    const { json: after } = await listByRef(questionnaireId, 'invite-1');
    expect(after.total).toBe(before.total);

    // §9.2's point, observed: editing the markup's ref permits a new submission.
    await serveEmbed(page, publicId, 'external-ref="invite-1-spoofed"');
    await fillAndFinish(page);
    expect((await listByRef(questionnaireId, 'invite-1-spoofed', 'COMPLETED')).json.total).toBe(1);
  });

  test('3. two sessions, same ref: the complete loser lands in already-submitted (§9.3)', async ({ page, context }) => {
    const loserPage = await context.newPage();
    await serveEmbed(page, publicId, 'external-ref="race-e2e"');
    await serveEmbed(loserPage, publicId, 'external-ref="race-e2e"');

    // Both fill to the last screen (both sessions IN_PROGRESS — legal, P5-D2).
    for (const p of [page, loserPage]) {
      const engine = p.locator('forms-engine');
      await engine.locator('[data-code="food1"] input').fill('pizza');
      await engine.getByRole('button', { name: 'Next' }).click();
      await expect(engine.getByText('anything else?')).toBeVisible();
    }

    // First completion wins…
    await page.locator('forms-engine').getByRole('button', { name: 'Finish' }).click();
    await expect(page.locator('forms-engine').getByText('Thank you!')).toBeVisible();

    // …the loser's 409 swaps it to already-submitted after filling (FR5-11).
    await loserPage.locator('forms-engine').getByRole('button', { name: 'Finish' }).click();
    await expect(loserPage.locator('forms-engine').getByText("You've already submitted this form.")).toBeVisible();
    expect(await alreadySubmittedEvents(loserPage)).toEqual([{ externalRef: 'race-e2e' }]);

    expect((await listByRef(questionnaireId, 'race-e2e', 'COMPLETED')).json.total).toBe(1);
    await loserPage.close();
  });

  test('4. ONE_PER_REF without a ref fails loudly; MULTIPLE renders normally (§9.4)', async ({ page }) => {
    await serveEmbed(page, publicId);
    const engine = page.locator('forms-engine');
    await expect(engine.getByText('This form is misconfigured: an external reference is required.')).toBeVisible();
    const errors = (await errorEvents(page)) as { code?: string }[];
    expect(errors.some((e) => e.code === 'EXTERNAL_REF_REQUIRED')).toBe(true);

    expect((await api('PATCH', `/api/v1/questionnaires/${questionnaireId}`,
      { submissionPolicy: 'MULTIPLE' })).status).toBe(200);
    await page.reload();
    await expect(engine.getByText('what is your favorite food?')).toBeVisible();
  });

  test('5. refresh-resume works with a ref; ref-status never leaks in-progress (§9.5)', async ({ page }) => {
    await serveEmbed(page, publicId, 'external-ref="resume-ref"');
    const engine = page.locator('forms-engine');
    await engine.locator('[data-code="food1"] input').fill('pizza');
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await engine.getByRole('button', { name: 'Next' }).click();
    await patched;

    await page.reload();
    await expect(engine.getByText('anything else?')).toBeVisible();

    // FR5-9: an in-progress ref answers NONE — byte-identical to an unknown one.
    const inProgress = await api<{ status: string }>(
      'GET', `/public/v1/questionnaires/${publicId}/ref-status?ref=resume-ref`);
    const unknown = await api<{ status: string }>(
      'GET', `/public/v1/questionnaires/${publicId}/ref-status?ref=never-seen-${STAMP}`);
    expect(inProgress.json).toEqual({ status: 'NONE' });
    expect(inProgress.json).toEqual(unknown.json);
  });

  test('6. label overrides for the two new states render (§9.5)', async ({ page }) => {
    expect((await api('PATCH', `/api/v1/questionnaires/${questionnaireId}`,
      { submissionPolicy: 'ONE_PER_REF' })).status).toBe(200);

    const labels = JSON.stringify({
      alreadySubmittedMessage: 'Ya has enviado este formulario.',
      refMissingError: 'Falta la referencia externa.',
    }).replace(/"/g, '&quot;');

    // invite-1 completed in test 2 → overridden already-submitted message.
    await serveEmbed(page, publicId, `external-ref="invite-1" labels="${labels}"`);
    await expect(page.locator('forms-engine').getByText('Ya has enviado este formulario.')).toBeVisible();

    // Missing ref → overridden config-error message.
    await serveEmbed(page, publicId, `labels="${labels}"`);
    await expect(page.locator('forms-engine').getByText('Falta la referencia externa.')).toBeVisible();

    expect((await api('PATCH', `/api/v1/questionnaires/${questionnaireId}`,
      { submissionPolicy: 'MULTIPLE' })).status).toBe(200);
  });
});
