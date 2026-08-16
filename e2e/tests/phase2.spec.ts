/**
 * Phase-2 acceptance walkthrough (Phase-2 BRD §11). Requires the compose
 * stack: editor on :8081, backend on :8080. §11.5 (old pinned bundle) is
 * covered by renderer component tests (unknown-type fallback); §11.6 (Photon
 * down) is covered by backend integration tests plus the route-abort check
 * here — autocomplete must never gate manual entry.
 */
import { expect, test, type Page } from '@playwright/test';
import { openExample } from './plain-html-example';

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:8080';

const NAME = `Phase2 Intake ${Date.now()}`;

const ALWAYS = { mode: 'ALWAYS' };
const NEVER = { mode: 'NEVER' };
const cond = (questionCode: string, operator: string, value: unknown, subField?: string) => ({
  source: 'QUESTION',
  questionCode,
  ...(subField ? { subField } : {}),
  operator,
  value,
});
const when = (...conditions: object[]) => ({
  mode: 'CONDITIONAL',
  rule: { combinator: 'ALL', conditions },
});

const q = (
  code: string,
  type: string,
  prompt: string,
  typeConfig: object,
  extra: object = {},
) => ({
  id: `id-${code || 'blk-intl'}`,
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

const options = (...labels: string[]) => labels.map((label, i) => ({ id: `o${i + 1}`, label }));

/** The full §11 questionnaire, PUT as the draft after the editor-UX checks. */
const definition = {
  schemaVersion: 2,
  steps: [
    {
      id: 'step-1',
      title: 'Details',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        q('hasAllergies', 'TOGGLE', 'Any food allergies in the party?', { trueLabel: 'Yes', falseLabel: 'No' }, {
          sectionTitle: 'Party',
          requirement: ALWAYS,
        }),
        q('allergyList', 'CHECKBOX', 'Which allergies?', { options: options('Peanuts', 'Shellfish', 'Gluten', 'Other'), maxSelections: null }, {
          sectionTitle: 'Party',
          visibility: when(cond('hasAllergies', 'EQUALS', true)),
        }),
        q('allergyOther', 'TEXT_BOX', 'Tell us about the other allergy', { size: 'MEDIUM', maxLength: 200 }, {
          sectionTitle: 'Party',
          visibility: when(cond('allergyList', 'CONTAINS', 'Other')),
        }),
        q('partySize', 'NUMBER', 'How many additional guests?', { min: 0, max: 20, decimalPlaces: 0, adornment: 'NONE', currencySymbol: '$' }, {
          sectionTitle: 'Party',
          requirement: ALWAYS,
        }),
        q('visitDate', 'DATE', 'Preferred visit date', { minDate: null, maxDate: null, disallowPast: true, disallowFuture: false }, {
          sectionTitle: 'Visit',
          requirement: ALWAYS,
        }),
        q('favDrink', 'DROPDOWN', 'Welcome drink', { options: options('Espresso', 'Green Tea', 'Sparkling Water', 'Orange Juice') }, {
          sectionTitle: 'Visit',
        }),
        q('contactEmail', 'EMAIL', 'Contact email', {}, { sectionTitle: 'Contact', requirement: ALWAYS }),
        q('contactPhone', 'PHONE', 'Contact phone', {}, { sectionTitle: 'Contact' }),
        q('homeAddr', 'ADDRESS', 'Home address', {
          enabledFields: { line2: true, state: true, postalCode: true },
          requiredFields: { line1: true, city: true },
          defaultCountry: 'US',
          autocomplete: true,
        }, { sectionTitle: 'Address' }),
        q('', 'DISPLAY_BLOCK', '', {
          content: '**International shipping notice** — deliveries outside the US take [longer](https://example.com/shipping).',
        }, {
          sectionTitle: 'Address',
          visibility: when(cond('homeAddr', 'NOT_EQUALS', 'US', 'country')),
        }),
        q('njOnly', 'TEXT_BOX', 'NJ residents: preferred pickup town?', { size: 'MEDIUM', maxLength: null }, {
          sectionTitle: 'Address',
          visibility: when(cond('homeAddr', 'EQUALS', 'NJ', 'state')),
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
        q('finalNotes', 'TEXT_BOX', 'anything else?', { size: 'LARGE', maxLength: null }),
      ],
    },
  ],
  tabs: [],
  questions: [],
};

const isoShift = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.describe.serial('Phase-2 acceptance walkthrough (§11)', () => {
  let questionnaireId: string;
  let publicId: string;

  test('1. editor: new types in the modal — toggle rule targets, display-block panel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New questionnaire' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(NAME);
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(/\/q\//);
    questionnaireId = page.url().split('/q/')[1];

    // Add a required TOGGLE through the modal (type dropdown lists all types).
    await page.getByRole('button', { name: 'Add question' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Unique Question Code').fill('hasAllergies');
    await dialog.getByLabel('Prompt').fill('Any food allergies in the party?');
    await dialog.getByLabel('Question Type').click();
    await page.getByRole('option', { name: 'Toggle (Yes/No)' }).click();
    await expect(dialog.getByLabel('“Yes” label')).toHaveValue('Yes');
    await dialog.getByRole('button', { name: 'Add question' }).click();
    await expect(dialog).toBeHidden();

    // CHECKBOX whose visibility rule targets the toggle: the adaptive rule
    // builder must offer only equals/not-equals and a Yes/No value dropdown
    // producing a boolean (FR2-16).
    await page.getByRole('button', { name: 'Add question' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Unique Question Code').fill('allergyList');
    await dialog.getByLabel('Prompt').fill('Which allergies?');
    await dialog.getByLabel('Question Type').click();
    await page.getByRole('option', { name: 'Checkboxes' }).click();
    for (const [i, label] of ['Peanuts', 'Other'].entries()) {
      await dialog.getByRole('button', { name: 'Add option' }).click();
      await dialog.getByLabel(`Option ${i + 1}`).fill(label);
    }
    const vis = dialog.locator('app-rule-builder[aspect="visibility"]');
    await vis.getByRole('checkbox', { name: 'Always visible' }).uncheck();
    await vis.getByRole('button', { name: 'Add condition' }).click();
    await vis.getByLabel('Question', { exact: true }).click();
    await page.getByRole('option', { name: 'hasAllergies' }).click();
    await vis.getByLabel('Operator').click();
    await expect(page.getByRole('option', { name: 'contains' })).toBeHidden();
    await page.getByRole('option', { name: 'equals', exact: true }).click();
    await vis.getByLabel('Value').click();
    await page.getByRole('option', { name: 'Yes' }).click();
    await dialog.getByRole('button', { name: 'Add question' }).click();
    await expect(dialog).toBeHidden();

    // The stored condition value is a typed boolean (FR2-7).
    await expect
      .poll(async () => {
        const detail = await (await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}`)).json();
        const list = detail.draft.questions.find((x: { code: string }) => x.code === 'allergyList');
        return list?.visibility.rule?.conditions[0]?.value;
      })
      .toBe(true);

    // DISPLAY_BLOCK: no code/prompt/requirement inputs; section remains (§6.9).
    await page.getByRole('button', { name: 'Add question' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Question Type').click();
    await page.getByRole('option', { name: 'Display text' }).click();
    await expect(dialog.getByLabel('Unique Question Code')).toBeHidden();
    await expect(dialog.getByLabel('Prompt')).toBeHidden();
    await expect(dialog.getByLabel('Section')).toBeVisible();
    await expect(dialog.getByText('Requirement', { exact: true })).toBeHidden();
    await dialog.getByLabel('Content').fill('Welcome! **Bold** greetings.');
    await dialog.getByRole('button', { name: 'Add question' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.question strong', { hasText: 'Bold' })).toBeVisible();
  });

  test('2. draft-replace with the full §11 definition, publish v1', async () => {
    const put = await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(definition),
    });
    expect(put.ok).toBeTruthy();
    const publish = await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'phase-2 walkthrough' }),
    });
    expect(publish.ok).toBeTruthy();
    const detail = await (await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}`)).json();
    publicId = detail.publicId;
    expect(detail.currentVersion).toBe(1);
  });

  test('3. respondent: toggle gating, CONTAINS cascade, 0-number, dates, dropdown, address', async ({ page }) => {
    // Deterministic autocomplete: stub the geocode proxy at the network layer
    // (the proxy itself is integration-tested against a stubbed Photon).
    await page.route('**/public/v1/geocode**', (route) => {
      const url = new URL(route.request().url());
      if ((url.searchParams.get('q') ?? '').startsWith('12 Main')) {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([
            {
              line1: '12 Main Street',
              city: 'Woodbury',
              state: 'NJ',
              postalCode: '08096',
              country: 'US',
              label: '12 Main Street, Woodbury, NJ 08096, United States',
            },
          ]),
        });
      }
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    });

    await openExample(page, publicId);
    const form = page.locator('forms-engine');
    await expect(form.getByText('Any food allergies')).toBeVisible();

    // Toggle starts unselected (P2-D4) and blocks navigation while required.
    await expect(form.locator('.fe-toggle-option[aria-pressed="true"]')).toHaveCount(0);
    await form.getByRole('button', { name: 'Next' }).click();
    await expect(form.getByText('This question is required.').first()).toBeVisible();

    // Checking Yes reveals allergyList; CONTAINS 'Other' reveals allergyOther;
    // unchecking clears the downstream answer (§6.7 cascade).
    await expect(form.getByText('Which allergies?')).toBeHidden();
    await form.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(form.getByText('Which allergies?')).toBeVisible();
    await expect(form.getByText('other allergy')).toBeHidden();
    await form.getByRole('checkbox', { name: 'Other' }).check();
    await expect(form.getByText('other allergy')).toBeVisible();
    await form.getByLabel(/other allergy/).fill('latex fruit syndrome');
    await form.getByRole('checkbox', { name: 'Other' }).uncheck();
    await expect(form.getByText('other allergy')).toBeHidden();
    await form.getByRole('checkbox', { name: 'Peanuts' }).check();
    await form.getByRole('checkbox', { name: 'Shellfish' }).check();

    // 0 in a required NUMBER passes gating (§3 — key present, never truthiness).
    await form.getByLabel(/additional guests/).fill('0');

    // DATE: past rejected inline (disallowPast), future accepted.
    const dateInput = form.locator('.fe-date-text');
    await dateInput.fill(isoShift(-1));
    await dateInput.press('Enter');
    await expect(form.getByText('cannot be in the past')).toBeVisible();
    await dateInput.fill(isoShift(7));
    await dateInput.press('Enter');
    await expect(form.getByText('cannot be in the past')).toBeHidden();

    // EMAIL format blocks navigation even before gating (§6.6).
    await form.getByLabel('Contact email').fill('not-an-email');
    await expect(form.getByText('Enter a valid email address.')).toBeVisible();
    await form.getByLabel('Contact email').fill('avery@example.com');
    await expect(form.getByText('Enter a valid email address.')).toBeHidden();
    await form.getByLabel('Contact phone').fill('(856) 555-0142');

    // DROPDOWN: client-side search filter, then select (§6.3).
    const drink = form.locator('[data-code="favDrink"]');
    await drink.locator('.fe-select-trigger').click();
    await drink.locator('.fe-select-search').fill('spark');
    await expect(drink.locator('.fe-select-option')).toHaveCount(1);
    await drink.locator('.fe-select-option').click();
    await expect(drink.locator('.fe-select-trigger')).toContainText('Sparkling Water');

    // ADDRESS autocomplete: typing suggests, selecting fills, still editable (§6.8.4).
    const addr = form.locator('[data-code="homeAddr"]');
    await addr.locator('input[id$="-line1"]').fill('12 Main');
    await expect(addr.locator('.fe-suggestion')).toHaveCount(1);
    await addr.locator('.fe-suggestion').click();
    await expect(addr.locator('input[id$="-city"]')).toHaveValue('Woodbury');
    await expect(addr.locator('input[id$="-postalCode"]')).toHaveValue('08096');
    await expect(addr.locator('fe-select[select-id$="-state"] .fe-select-trigger')).toContainText('New Jersey');

    // njOnly appears for NJ (address sub-field EQUALS, FR2-6).
    await expect(form.getByText('NJ residents')).toBeVisible();

    // Switching country US→Canada: state dropdown becomes free text and is
    // cleared; line1/city are preserved; the intl display block appears.
    const country = addr.locator('fe-select[select-id$="-country"]');
    await country.locator('.fe-select-trigger').click();
    await country.locator('.fe-select-search').fill('canada');
    await country.locator('.fe-select-option').click();
    await expect(addr.locator('input[id$="-state"]')).toHaveValue('');
    await expect(addr.locator('input[id$="-line1"]')).toHaveValue('12 Main Street');
    await expect(addr.locator('input[id$="-city"]')).toHaveValue('Woodbury');
    await expect(form.getByText('International shipping notice')).toBeVisible();
    await expect(form.locator('.fe-display-block a[target="_blank"]')).toBeVisible();
    await expect(form.getByText('NJ residents')).toBeHidden();

    // Back to US + NJ for the stored-codes assertion (P2-D6).
    await country.locator('.fe-select-trigger').click();
    await country.locator('.fe-select-search').fill('united stat');
    await country.locator('.fe-select-option', { hasText: 'United States' }).first().click();
    const state = addr.locator('fe-select[select-id$="-state"]');
    await state.locator('.fe-select-trigger').click();
    await state.locator('.fe-select-search').fill('new jersey');
    await state.locator('.fe-select-option').click();
    await expect(form.getByText('NJ residents')).toBeVisible();
    await form.getByLabel(/preferred pickup town/).fill('Woodbury');
    await expect(form.getByText('International shipping notice')).toBeHidden();

    // Forward to step 2, finish.
    await form.getByRole('button', { name: 'Next' }).click();
    await expect(form.getByText('anything else?')).toBeVisible();
    await form.getByRole('button', { name: 'Finish' }).click();
    await expect(form.getByText('Thank you!')).toBeVisible();
  });

  test('4. stored response has the §3 typed shapes exactly', async () => {
    const res = await (
      await fetch(`${BACKEND}/api/v1/questionnaires/${questionnaireId}/responses?status=COMPLETED`)
    ).json();
    expect(res.total).toBe(1);
    const answers = res.items[0].answers;
    expect(answers['hasAllergies']).toBe(true); // boolean
    expect(answers['allergyList']).toEqual(['Peanuts', 'Shellfish']); // array, option order
    expect(answers['allergyOther']).toBeUndefined(); // cleared by CONTAINS cascade
    expect(answers['partySize']).toBe(0); // number 0 — a real answer
    expect(answers['visitDate']).toMatch(/^\d{4}-\d{2}-\d{2}$/); // ISO date string
    expect(answers['favDrink']).toBe('Sparkling Water');
    expect(answers['contactEmail']).toBe('avery@example.com');
    expect(answers['homeAddr']).toEqual({
      country: 'US',
      line1: '12 Main Street',
      line2: '',
      city: 'Woodbury',
      state: 'NJ',
      postalCode: '08096',
    });
  });

  test('5. geocoder failure degrades silently — manual entry unaffected (§6.8.4)', async ({ page }) => {
    await page.route('**/public/v1/geocode**', (route) => route.abort());
    await openExample(page, publicId);
    const form = page.locator('forms-engine');
    await expect(form.getByText('Home address')).toBeVisible();
    const addr = form.locator('[data-code="homeAddr"]');
    await addr.locator('input[id$="-line1"]').fill('500 Manual Entry Way');
    await addr.locator('input[id$="-city"]').fill('Trenton');
    await expect(addr.locator('.fe-suggestion')).toHaveCount(0);
    await expect(addr.locator('input[id$="-line1"]')).toHaveValue('500 Manual Entry Way');
  });
});
