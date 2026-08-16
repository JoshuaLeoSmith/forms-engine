/**
 * Acceptance walkthrough end-to-end (BRD §15, NFR-7). Requires the compose
 * stack: editor on :8081, backend on :8080, Mongo behind the backend.
 */
import { expect, test, type Page } from '@playwright/test';
import { openExample } from './plain-html-example';

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:8080';

const NAME = `Demo Intake ${Date.now()}`;

async function addQuestion(
  page: Page,
  q: {
    code: string;
    section: string;
    prompt: string;
    type?: 'Text Box' | 'Radio';
    options?: string[];
    required: boolean;
    visibilityRule?: {
      code: string;
      operator: 'equals' | 'not equals';
      value: string;
      /** True when the referenced question is a RADIO — the value input is a dropdown (§6.5). */
      valueIsOption?: boolean;
    };
  },
): Promise<void> {
  await page.getByRole('button', { name: 'Add question' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Unique Question Code').fill(q.code);
  await dialog.getByLabel('Section').fill(q.section);
  await dialog.getByLabel('Prompt').fill(q.prompt);
  if (q.type === 'Radio') {
    await dialog.getByLabel('Question Type').click();
    await page.getByRole('option', { name: 'Radio' }).click();
    for (const [i, label] of (q.options ?? []).entries()) {
      await dialog.getByRole('button', { name: 'Add option' }).click();
      await dialog.getByLabel(`Option ${i + 1}`).fill(label);
    }
  }
  if (!q.required) {
    await dialog.getByRole('checkbox', { name: 'Always required' }).uncheck();
  }
  if (q.visibilityRule) {
    // Scope to the visibility panel — the requirement panel renders the same builder.
    const vis = dialog.locator('app-rule-builder[aspect="visibility"]');
    await vis.getByRole('checkbox', { name: 'Always visible' }).uncheck();
    await vis.getByRole('button', { name: 'Add condition' }).click();
    await vis.getByLabel('Question', { exact: true }).click();
    await page.getByRole('option', { name: q.visibilityRule.code, exact: true }).click();
    await vis.getByLabel('Operator').click();
    await page.getByRole('option', { name: q.visibilityRule.operator, exact: true }).click();
    if (q.visibilityRule.valueIsOption) {
      await vis.getByLabel('Value').click();
      await page.getByRole('option', { name: q.visibilityRule.value, exact: true }).click();
    } else {
      await vis.getByLabel('Value').fill(q.visibilityRule.value);
    }
  }
  await dialog.getByRole('button', { name: /Add question|Save question/ }).click();
  await expect(dialog).toBeHidden();
}

test.describe.serial('acceptance walkthrough (§15)', () => {
  let questionnaireId: string;
  let publicId: string;

  test('1-3. build Demo Intake in the editor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New questionnaire' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(NAME);
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(/\/q\//);
    questionnaireId = page.url().split('/q/')[1];

    // Step 1 with Tab 1
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByRole('button', { name: 'Step actions' }).click();
    await page.getByRole('menuitem', { name: 'Add tab' }).click();

    // Food section
    await addQuestion(page, {
      code: 'food1', section: 'Food', prompt: 'what is your favorite food?', required: true,
    });
    await addQuestion(page, {
      code: 'food2', section: 'Food', prompt: 'what is the best dessert?', type: 'Radio',
      options: ['Cake', 'Ice Cream', 'Cookies'], required: false,
    });

    // Colors section with a conditional radio
    await addQuestion(page, {
      code: 'color1', section: 'Colors', prompt: 'whats your favorite color?', required: true,
    });
    await addQuestion(page, {
      code: 'colorBlack', section: 'Colors', prompt: 'do you like the color black?', type: 'Radio',
      options: ['Yes', 'No'], required: false,
      visibilityRule: { code: 'color1', operator: 'not equals', value: 'black' },
    });

    // Both section cards, grouped, inert (FR-E-5)
    await expect(page.getByRole('heading', { name: 'Food' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Colors' })).toBeVisible();

    // Step 2 with direct questions (optional-hierarchy path)
    await page.getByRole('button', { name: 'Add step' }).click();
    await addQuestion(page, {
      code: 'extra1', section: '', prompt: 'anything else?', required: false,
    });

    // 4. Publish v1
    await page.getByRole('button', { name: 'Publish changes' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText('Live = v1')).toBeVisible();

    const detail = await (await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}`)).json();
    publicId = detail.publicId;
    expect(detail.currentVersion).toBe(1);
  });

  test('5-6. respondent flow: gating, conditional show/hide+clear, persistence, completion', async ({ page }) => {
    await openExample(page, publicId);
    const form = page.locator('forms-engine');
    await expect(form.getByText('what is your favorite food?')).toBeVisible();

    // colorBlack absent while color1 empty (§6.3)
    await expect(form.getByText('do you like the color black?')).toBeHidden();

    // Gating: Next blocked until required questions answered (FR-L-5)
    await form.getByRole('button', { name: 'Next' }).click();
    await expect(form.getByText('This question is required.').first()).toBeVisible();

    await form.getByLabel(/favorite food/).fill('pizza');
    await form.getByLabel(/favorite color/).fill('black');
    await expect(form.getByText('do you like the color black?')).toBeHidden();
    await form.getByLabel(/favorite color/).fill('red');
    await expect(form.getByText('do you like the color black?')).toBeVisible();
    await form.getByRole('radio', { name: 'Yes' }).check();

    // Hide again and confirm the answer is cleared server-side after navigation (D-3/D-7)
    await form.getByLabel(/favorite color/).fill('black');
    await expect(form.getByText('do you like the color black?')).toBeHidden();
    await form.getByLabel(/favorite color/).fill('blue');

    await form.getByRole('button', { name: 'Next' }).click();
    await expect(form.getByText('anything else?')).toBeVisible();

    // One IN_PROGRESS response pinned to v1, flat answers, correct lastPosition (FR-L-8/9/10)
    await expect
      .poll(async () => {
        const res = await (
          await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses`)
        ).json();
        return res.items[0]?.answers;
      })
      .toEqual({ food1: 'pizza', color1: 'blue' });
    const responses = await (
      await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses`)
    ).json();
    expect(responses.total).toBe(1);
    expect(responses.items[0].versionNumber).toBe(1);
    expect(responses.items[0].status).toBe('IN_PROGRESS');
    expect(responses.items[0].answers['colorBlack']).toBeUndefined();

    // Free backward navigation, then complete (FR-L-5/11)
    await form.getByRole('button', { name: 'Back' }).click();
    await expect(form.getByText('what is your favorite food?')).toBeVisible();
    await form.getByRole('button', { name: 'Next' }).click();
    await form.getByRole('button', { name: 'Finish' }).click();
    await expect(form.getByText('Thank you!')).toBeVisible();
    await expect
      .poll(async () => {
        const res = await (
          await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses?status=COMPLETED`)
        ).json();
        return res.total;
      })
      .toBe(1);
  });

  test('7. rename impact updates references; delete makes dependent rule fail open', async ({ page }) => {
    await page.goto(`/q/${questionnaireId}`);

    // Add a question whose rule references food2, to give the rename something to update.
    await page.getByRole('button', { name: 'Step 1' }).click();
    await addQuestion(page, {
      code: 'cakeFan', section: 'Food', prompt: 'why cake?', required: false,
      visibilityRule: { code: 'food2', operator: 'equals', value: 'Cake', valueIsOption: true },
    });

    // Rename food2 → dessert1 (FR-E-13): impact modal lists the reference, updates it.
    await page.locator('.question', { hasText: 'food2' }).hover();
    await page.locator('.question', { hasText: 'food2' }).getByRole('button', { name: 'Edit question' }).click();
    await page.getByRole('dialog').getByLabel('Unique Question Code').fill('dessert1');
    await page.getByRole('dialog').getByRole('button', { name: 'Save question' }).click();
    await expect(page.getByRole('dialog').getByText(/will be updated/)).toBeVisible();
    await page.getByRole('button', { name: 'Rename and update references' }).click();

    // Delete color1 (FR-E-14): colorBlack loses its last condition → fails open.
    await page.locator('.question', { hasText: 'color1' }).hover();
    await page.locator('.question', { hasText: 'color1' }).getByRole('button', { name: 'Delete question' }).click();
    await expect(page.getByRole('dialog').getByText(/always visible/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete question' }).click();

    // Fail-open verified in the draft via the management API.
    await expect
      .poll(async () => {
        const detail = await (await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}`)).json();
        const questions = detail.draft.steps[0].tabs[0].questions;
        const colorBlack = questions.find((q: { code: string }) => q.code === 'colorBlack');
        const cakeFan = questions.find((q: { code: string }) => q.code === 'cakeFan');
        return {
          colorBlackVisibility: colorBlack?.visibility.mode,
          cakeFanRef: cakeFan?.visibility.rule?.conditions[0]?.questionCode,
        };
      })
      .toEqual({ colorBlackVisibility: 'ALWAYS', cakeFanRef: 'dessert1' });
  });

  test('8. version pinning across publishes; history and restore', async ({ page }) => {
    // Open a respondent session on v1's live definition... (v2 not yet published)
    const early = await page.context().newPage();
    await openExample(early, publicId);
    await expect(early.locator('forms-engine').getByText('what is your favorite food?')).toBeVisible();

    // Publish v2 from the editor.
    await page.goto(`/q/${questionnaireId}`);
    await page.getByRole('button', { name: 'Publish changes' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText('Live = v2')).toBeVisible();

    // The pre-publish session continues and completes against v1 (D-5).
    const earlyForm = early.locator('forms-engine');
    await earlyForm.getByLabel(/favorite food/).fill('soup');
    await earlyForm.getByLabel(/favorite color/).fill('green');
    await earlyForm.getByRole('radio', { name: 'Yes' }).check();
    await earlyForm.getByRole('button', { name: 'Next' }).click();
    await earlyForm.getByRole('button', { name: 'Finish' }).click();
    await expect(earlyForm.getByText('Thank you!')).toBeVisible();
    const all = await (
      await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses`)
    ).json();
    const versions = all.items.map((r: { versionNumber: number }) => r.versionNumber).sort();
    expect(versions).toEqual([1, 1]);

    // A fresh session receives v2 (FR-E-17): color1 was deleted, and colorBlack
    // became always-visible via fail-open — both observable immediately.
    const fresh = await page.context().newPage();
    await openExample(fresh, publicId);
    const freshForm = fresh.locator('forms-engine');
    await expect(freshForm.getByText('do you like the color black?')).toBeVisible();
    await expect(freshForm.getByText('whats your favorite color?')).toBeHidden();

    // History shows both; restore v1 to draft and publish → v3 (FR-E-18).
    await page.getByRole('button', { name: 'Version history' }).click();
    await expect(page.getByRole('dialog').locator('.version-row', { hasText: 'v2' })).toBeVisible();
    await page
      .getByRole('dialog')
      .locator('.version-row', { hasText: 'v1' })
      .getByRole('button', { name: 'Restore to draft' })
      .click();
    await page.getByRole('button', { name: 'Restore to draft', exact: true }).last().click();
    await page.getByRole('button', { name: 'Publish changes' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText('Live = v3')).toBeVisible();

    const v1 = await (
      await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/versions/1`)
    ).json();
    const v3 = await (
      await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/versions/3`)
    ).json();
    expect(v3.definition).toEqual(v1.definition);
  });
});
