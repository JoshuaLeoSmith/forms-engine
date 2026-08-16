/**
 * Phase-2 component tests (NFR2-2/NFR-7): typed answers end-to-end, format
 * gating, toggle no-default, checkbox order + maxSelections, dropdown search,
 * date validation, display-block sanitization, address objects + sub-field
 * rules, and the unknown-type fallback (FR2-9).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index.js';
import type { FormsEngineElement } from '../src/index.js';
import type { AnswersMap, Definition, QuestionDef, RuleConfig } from '../src/core/index.js';

const ALWAYS: RuleConfig = { mode: 'ALWAYS' };
const NEVER: RuleConfig = { mode: 'NEVER' };

function q(partial: Partial<QuestionDef> & Pick<QuestionDef, 'id' | 'code' | 'prompt' | 'type'>): QuestionDef {
  return {
    sectionTitle: '',
    width: 'DEFAULT',
    typeConfig: {},
    visibility: ALWAYS,
    requirement: NEVER,
    ...partial,
  };
}

const definition: Definition = {
  schemaVersion: 2,
  steps: [
    {
      id: 's1',
      title: 'Step 1',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        q({
          id: 'idtgl', code: 'tgl', prompt: 'do you have allergies?', type: 'TOGGLE',
          typeConfig: { trueLabel: 'Yes', falseLabel: 'No' }, requirement: ALWAYS,
        }),
        q({
          id: 'idnum', code: 'num', prompt: 'party size?', type: 'NUMBER',
          typeConfig: { min: null, max: 20, decimalPlaces: 0, adornment: 'NONE', currencySymbol: '$' },
        }),
        q({
          id: 'idmin', code: 'minNum', prompt: 'minimum one?', type: 'NUMBER',
          typeConfig: { min: 1, max: null, decimalPlaces: null, adornment: 'NONE', currencySymbol: '$' },
        }),
        q({ id: 'idemail', code: 'email', prompt: 'contact email?', type: 'EMAIL' }),
        q({
          id: 'idchk', code: 'chk', prompt: 'toppings?', type: 'CHECKBOX',
          typeConfig: {
            options: [
              { id: 'o1', label: 'Mushroom' },
              { id: 'o2', label: 'Onion' },
              { id: 'o3', label: 'Pepper' },
            ],
            maxSelections: 2,
          },
        }),
        q({
          id: 'iddrop', code: 'drop', prompt: 'favorite color?', type: 'DROPDOWN',
          typeConfig: {
            options: [
              { id: 'o1', label: 'Red' },
              { id: 'o2', label: 'Green' },
              { id: 'o3', label: 'Blue' },
            ],
          },
        }),
        q({
          id: 'iddate', code: 'visitDate', prompt: 'visit date?', type: 'DATE',
          typeConfig: { minDate: '2020-01-01', maxDate: '2999-12-31', disallowPast: false, disallowFuture: false },
        }),
        q({
          id: 'idaddr', code: 'addr', prompt: 'home address?', type: 'ADDRESS',
          typeConfig: {
            enabledFields: { line2: true, state: true, postalCode: true },
            requiredFields: {},
            defaultCountry: 'US',
            autocomplete: false,
          },
        }),
        q({
          id: 'idnj', code: 'njOnly', prompt: 'NJ resident perks', type: 'TEXT_BOX',
          typeConfig: { size: 'MEDIUM', maxLength: null },
          visibility: {
            mode: 'CONDITIONAL',
            rule: {
              combinator: 'ALL',
              conditions: [
                { source: 'QUESTION', questionCode: 'addr', subField: 'state', operator: 'EQUALS', value: 'NJ' },
              ],
            },
          },
        }),
        q({
          id: 'idblock', code: '', prompt: '', type: 'DISPLAY_BLOCK',
          typeConfig: { content: '**Bold** move and a [safe link](https://example.com).\n\n<script>alert(1)</script>' },
        }),
        q({ id: 'idfuture', code: 'future', prompt: 'from the future', type: 'HOLOGRAM', requirement: ALWAYS }),
      ],
    },
    {
      id: 's2',
      title: 'Step 2',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        q({ id: 'idq9', code: 'q9', prompt: 'anything else?', type: 'TEXT_BOX', typeConfig: { size: 'MEDIUM', maxLength: null } }),
      ],
    },
  ],
  tabs: [],
  questions: [],
};

interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

let calls: RecordedCall[];

function installFetchMock(): void {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url: String(url), body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (method === 'GET' && String(url).endsWith('/live')) {
        return json({ publicId: 'q_p2', name: 'P2', versionNumber: 3, definition });
      }
      if (method === 'GET' && String(url).includes('/geocode')) {
        return json([]);
      }
      if (method === 'POST' && String(url).endsWith('/responses')) {
        return json({ responseId: 'r_p2' });
      }
      return json({}, 200);
    }),
  );
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function mount(): Promise<FormsEngineElement> {
  const el = document.createElement('forms-engine') as FormsEngineElement;
  el.setAttribute('public-id', 'q_p2');
  el.setAttribute('api-base', 'http://backend.test');
  document.body.appendChild(el);
  await waitFor(() => !!el.shadowRoot?.textContent?.includes('allergies'));
  return el;
}

const shadowText = (el: FormsEngineElement) => el.shadowRoot?.textContent ?? '';

function root(el: FormsEngineElement, code: string): HTMLElement {
  const node = el.shadowRoot!.querySelector<HTMLElement>(`[data-code="${code}"]`);
  if (!node) {
    throw new Error(`no question ${code}`);
  }
  return node;
}

function setInput(input: HTMLInputElement | null, value: string, blur = false): void {
  if (!input) {
    throw new Error('input not found');
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (blur) {
    input.dispatchEvent(new Event('blur', { bubbles: false }));
  }
}

function clickByText(scope: HTMLElement | ShadowRoot, label: string): void {
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button')];
  const button = buttons.find((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim().includes(label));
  if (!button) {
    throw new Error(`no button "${label}"`);
  }
  button.click();
}

function clickNext(el: FormsEngineElement): void {
  clickByText(el.shadowRoot!, 'Next');
}

function lastPatchAnswers(): AnswersMap {
  const patches = calls.filter((c) => c.method === 'PATCH');
  return (patches[patches.length - 1]!.body as { answers: AnswersMap }).answers;
}

async function satisfyToggle(el: FormsEngineElement, value: 'Yes' | 'No' = 'Yes'): Promise<void> {
  clickByText(root(el, 'tgl'), value);
  await el.updateComplete;
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<forms-engine> Phase 2', () => {
  it('required TOGGLE starts unselected, blocks navigation, and stores an explicit boolean (P2-D4)', async () => {
    const el = await mount();
    const pressed = [...root(el, 'tgl').querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['false', 'false']);
    clickNext(el);
    await el.updateComplete;
    expect(shadowText(el)).toContain('This question is required.');
    await satisfyToggle(el, 'No');
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['tgl']).toBe(false);
  });

  it('a 0-valued NUMBER answer passes gating and is stored as a JSON number (§3)', async () => {
    const el = await mount();
    await satisfyToggle(el);
    setInput(root(el, 'num').querySelector('input'), '0', true);
    await el.updateComplete;
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['num']).toBe(0);
  });

  it('NUMBER min violations block navigation even though the question is optional (§6.5)', async () => {
    const el = await mount();
    await satisfyToggle(el);
    setInput(root(el, 'minNum').querySelector('input'), '0', true);
    await el.updateComplete;
    expect(shadowText(el)).toContain('The value must be at least 1.');
    clickNext(el);
    await el.updateComplete;
    expect(shadowText(el)).toContain('party size'); // still on screen 1
    setInput(root(el, 'minNum').querySelector('input'), '3', true);
    await el.updateComplete;
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['minNum']).toBe(3);
  });

  it('EMAIL format violations block navigation on an optional-but-answered question (§6.6)', async () => {
    const el = await mount();
    await satisfyToggle(el);
    setInput(root(el, 'email').querySelector('input'), 'not-an-email');
    await el.updateComplete;
    expect(shadowText(el)).toContain('Enter a valid email address.');
    clickNext(el);
    await el.updateComplete;
    expect(shadowText(el)).toContain('party size');
    setInput(root(el, 'email').querySelector('input'), 'j@example.com');
    await el.updateComplete;
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['email']).toBe('j@example.com');
  });

  it('CHECKBOX stores labels in option order and enforces maxSelections with disabled boxes (§6.2)', async () => {
    const el = await mount();
    const boxes = () => [...root(el, 'chk').querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    // Check Pepper first, then Mushroom — stored order must follow options.
    boxes()[2].click();
    await el.updateComplete;
    boxes()[0].click();
    await el.updateComplete;
    expect(shadowText(el)).toContain('Select up to 2.');
    expect(boxes()[1].disabled).toBe(true); // max reached
    await satisfyToggle(el);
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['chk']).toEqual(['Mushroom', 'Pepper']);
  });

  it('DROPDOWN filters client-side, stores the label, and clears via the × affordance (§6.3)', async () => {
    const el = await mount();
    const drop = root(el, 'drop');
    drop.querySelector<HTMLButtonElement>('.fe-select-trigger')!.click();
    await waitFor(() => !!drop.querySelector('.fe-select-search'));
    setInput(drop.querySelector<HTMLInputElement>('.fe-select-search'), 'gr');
    await waitFor(() => drop.querySelectorAll('.fe-select-option').length === 1);
    (drop.querySelector<HTMLElement>('.fe-select-option'))!.click();
    await el.updateComplete;
    expect(drop.textContent).toContain('Green');
    await satisfyToggle(el);
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['drop']).toBe('Green');
    // Back, then clear the selection — the key disappears on the next save.
    clickByText(el.shadowRoot!, 'Back');
    await waitFor(() => shadowText(el).includes('favorite color'));
    root(el, 'drop').querySelector<HTMLButtonElement>('.fe-select-clear')!.click();
    await el.updateComplete;
    clickNext(el);
    await waitFor(() => calls.filter((c) => c.method === 'PATCH').length >= 2);
    expect(lastPatchAnswers()['drop']).toBeUndefined();
  });

  it('DATE rejects garbage and out-of-range input inline, accepts valid entry (§6.4)', async () => {
    const el = await mount();
    await satisfyToggle(el);
    const dateInput = () => root(el, 'visitDate').querySelector<HTMLInputElement>('.fe-date-text');
    setInput(dateInput(), 'not a date', true);
    await el.updateComplete;
    expect(shadowText(el)).toContain('Enter a valid date');
    clickNext(el);
    await el.updateComplete;
    expect(shadowText(el)).toContain('party size'); // blocked
    setInput(dateInput(), '2019-06-01', true);
    await el.updateComplete;
    expect(shadowText(el)).toContain('on or after 2020-01-01');
    setInput(dateInput(), '03/14/2026', true);
    await el.updateComplete;
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['visitDate']).toBe('2026-03-14');
  });

  it('DISPLAY_BLOCK renders sanitized markdown: bold + safe links, no script pass-through (§6.9)', async () => {
    const el = await mount();
    const block = el.shadowRoot!.querySelector('.fe-display-block')!;
    expect(block.querySelector('strong')?.textContent).toBe('Bold');
    const link = block.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(block.querySelector('script')).toBeNull();
    expect(block.textContent).toContain('<script>alert(1)</script>');
  });

  it('ADDRESS answers as a flat object with the default country, ZIP validated in US mode (§6.8)', async () => {
    const el = await mount();
    await satisfyToggle(el);
    const addr = root(el, 'addr');
    setInput(addr.querySelector<HTMLInputElement>('input[id$="-city"]'), 'Woodbury');
    await el.updateComplete;
    setInput(addr.querySelector<HTMLInputElement>('input[id$="-postalCode"]'), '123');
    await el.updateComplete;
    expect(shadowText(el)).toContain('Enter a valid ZIP code');
    clickNext(el);
    await el.updateComplete;
    expect(shadowText(el)).toContain('party size'); // blocked by ZIP format
    setInput(addr.querySelector<HTMLInputElement>('input[id$="-postalCode"]'), '08096');
    await el.updateComplete;
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['addr']).toEqual({
      country: 'US',
      line1: '',
      line2: '',
      city: 'Woodbury',
      state: '',
      postalCode: '08096',
    });
  });

  it('address sub-field rules fire from the state dropdown (FR2-6): njOnly appears for NJ', async () => {
    const el = await mount();
    const addr = root(el, 'addr');
    expect(shadowText(el)).not.toContain('NJ resident perks');
    // Materialize the address, then pick New Jersey in the state fe-select.
    setInput(addr.querySelector<HTMLInputElement>('input[id$="-city"]'), 'Woodbury');
    await el.updateComplete;
    const stateSelect = addr.querySelector<HTMLElement>('fe-select[select-id$="-state"]')!;
    stateSelect.querySelector<HTMLButtonElement>('.fe-select-trigger')!.click();
    await waitFor(() => !!stateSelect.querySelector('.fe-select-search'));
    setInput(stateSelect.querySelector<HTMLInputElement>('.fe-select-search'), 'new jersey');
    await waitFor(() => stateSelect.querySelectorAll('.fe-select-option').length === 1);
    stateSelect.querySelector<HTMLElement>('.fe-select-option')!.click();
    await el.updateComplete;
    expect(shadowText(el)).toContain('NJ resident perks');
  });

  it('unknown types degrade: placeholder, fe-error once per type, never blocks gating (FR2-9)', async () => {
    const errors: CustomEvent[] = [];
    const el = document.createElement('forms-engine') as FormsEngineElement;
    el.addEventListener('fe-error', (e) => errors.push(e as CustomEvent));
    el.setAttribute('public-id', 'q_p2');
    el.setAttribute('api-base', 'http://backend.test');
    document.body.appendChild(el);
    await waitFor(() => !!el.shadowRoot?.textContent?.includes('allergies'));
    expect(shadowText(el)).toContain('This question requires a newer version of the form component.');
    const unknownErrors = errors.filter((e) => e.detail?.code === 'UNKNOWN_QUESTION_TYPE');
    expect(unknownErrors).toHaveLength(1);
    expect(unknownErrors[0].detail.type).toBe('HOLOGRAM');
    // Despite requirement ALWAYS on the unknown type, only the toggle gates.
    await satisfyToggle(el);
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['future']).toBeUndefined();
    expect(shadowText(el)).toContain('anything else');
  });
});
