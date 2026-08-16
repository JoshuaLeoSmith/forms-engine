/**
 * Phase-5 component tests: the external-ref attribute (FR5-1), the mount-time
 * ref-status check with the already-submitted and config-error states
 * (FR5-5/8/11), ALREADY_SUBMITTED handling on create and complete 409s
 * (FR5-6), and the new label keys.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index.js';
import type { FormsEngineElement } from '../src/index.js';
import type { Definition, QuestionDef, RuleConfig } from '../src/core/index.js';

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
          id: 'idq1', code: 'q1', prompt: 'what is your favorite food?',
          type: 'TEXT_BOX', typeConfig: { size: 'MEDIUM', maxLength: null }, requirement: ALWAYS,
        }),
      ],
    },
    {
      id: 's2',
      title: 'Step 2',
      visibility: ALWAYS,
      requirement: NEVER,
      tabs: [],
      questions: [
        q({ id: 'idq2', code: 'q2', prompt: 'anything else?', type: 'TEXT_BOX', typeConfig: { size: 'MEDIUM', maxLength: null } }),
      ],
    },
  ],
  tabs: [],
  questions: [],
};

const SESSION_KEY = 'forms-engine:http://backend.test|q_test';

// ---- fetch mock -------------------------------------------------------------

interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

let calls: RecordedCall[];
let submissionPolicy: 'MULTIPLE' | 'ONE_PER_REF';
let refStatus: 'NONE' | 'COMPLETED';
let refStatusFails: boolean;
let createConflict: boolean;
let completeConflict: boolean;

function installFetchMock(): void {
  calls = [];
  submissionPolicy = 'MULTIPLE';
  refStatus = 'NONE';
  refStatusFails = false;
  createConflict = false;
  completeConflict = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url: String(url), body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      const conflict = () =>
        json({ status: 409, message: 'a completed response already exists for this reference', errors: [], code: 'ALREADY_SUBMITTED' }, 409);
      if (method === 'GET' && String(url).includes('/ref-status')) {
        if (refStatusFails) {
          return json({ message: 'boom' }, 500);
        }
        return json({ status: refStatus });
      }
      if (method === 'GET' && String(url).endsWith('/live')) {
        return json({ publicId: 'q_test', name: 'Test', versionNumber: 3, definition, submissionPolicy });
      }
      if (method === 'POST' && String(url).endsWith('/responses')) {
        return createConflict ? conflict() : json({ responseId: 'r_test' });
      }
      if (method === 'POST' && String(url).endsWith('/complete')) {
        return completeConflict ? conflict() : json({});
      }
      return json({}, 200);
    }),
  );
}

// ---- harness ----------------------------------------------------------------

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const shadowText = (el: FormsEngineElement) => el.shadowRoot?.textContent ?? '';

function mount(attrs: Record<string, string> = {}): FormsEngineElement {
  const el = document.createElement('forms-engine') as FormsEngineElement;
  el.setAttribute('public-id', 'q_test');
  el.setAttribute('api-base', 'http://backend.test');
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

async function mountReady(attrs: Record<string, string> = {}): Promise<FormsEngineElement> {
  const el = mount(attrs);
  await waitFor(() => shadowText(el).includes('favorite food'));
  return el;
}

function typeText(el: FormsEngineElement, code: string, value: string): void {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>(
    `[data-code="${code}"] input, [data-code="${code}"] textarea`,
  );
  if (!input) {
    throw new Error(`no input for ${code}`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clickByText(el: FormsEngineElement, label: string): void {
  const buttons = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')];
  const button = buttons.find((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim().includes(label));
  if (!button) {
    throw new Error(`no button "${label}"`);
  }
  button.click();
}

function collect(el: FormsEngineElement, type: string): unknown[] {
  const details: unknown[] = [];
  el.addEventListener(type, (e) => details.push((e as CustomEvent).detail));
  return details;
}

beforeEach(() => {
  installFetchMock();
  window.sessionStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- FR5-1: the attribute ---------------------------------------------------

describe('external-ref attribute (FR5-1)', () => {
  it('passes the trimmed ref on response creation and checks ref-status on mount', async () => {
    const el = await mountReady({ 'external-ref': '  user-4821  ' });
    const statusCall = calls.find((c) => c.url.includes('/ref-status'));
    expect(statusCall, 'ref-status must be checked on mount whenever a ref is supplied').toBeTruthy();
    expect(statusCall!.url).toContain('ref=user-4821');

    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => calls.some((c) => c.method === 'POST' && c.url.endsWith('/responses')));
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/responses'));
    expect((create!.body as { externalRef?: string }).externalRef).toBe('user-4821');
  });

  it('omits the ref entirely when none is supplied and skips ref-status', async () => {
    const el = await mountReady();
    expect(calls.some((c) => c.url.includes('/ref-status'))).toBe(false);
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => calls.some((c) => c.method === 'POST' && c.url.endsWith('/responses')));
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/responses'));
    expect('externalRef' in (create!.body as object)).toBe(false);
  });

  it('ignores a mid-session ref change with a console warning (P5-D4)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = await mountReady({ 'external-ref': 'user-1' });
    el.setAttribute('external-ref', 'user-2');
    await el.updateComplete;
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('external-ref changed mid-session'));

    // The session keeps its original identity claim on the eventual create.
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => calls.some((c) => c.method === 'POST' && c.url.endsWith('/responses')));
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/responses'));
    expect((create!.body as { externalRef?: string }).externalRef).toBe('user-1');
  });

  it('treats an over-long ref as absent, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mountReady({ 'external-ref': 'x'.repeat(129) });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('max 128'));
    expect(calls.some((c) => c.url.includes('/ref-status'))).toBe(false);
  });
});

// ---- FR5-5: config error ----------------------------------------------------

describe('ONE_PER_REF without a ref (FR5-5)', () => {
  it('renders the config-error state and emits EXTERNAL_REF_REQUIRED', async () => {
    submissionPolicy = 'ONE_PER_REF';
    const el = mount();
    const errors = collect(el, 'fe-error');
    await waitFor(() => shadowText(el).includes('misconfigured'));
    expect(shadowText(el)).toContain('This form is misconfigured: an external reference is required.');
    expect(errors.some((e) => (e as { code?: string }).code === 'EXTERNAL_REF_REQUIRED')).toBe(true);
    // The form never rendered and no response was created.
    expect(shadowText(el)).not.toContain('favorite food');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('renders normally under MULTIPLE without a ref', async () => {
    const el = await mountReady();
    expect(shadowText(el)).toContain('favorite food');
  });

  it('honors the refMissingError label override', async () => {
    submissionPolicy = 'ONE_PER_REF';
    const el = mount({ labels: '{"refMissingError":"Falta la referencia."}' });
    await waitFor(() => shadowText(el).includes('Falta la referencia.'));
  });
});

// ---- FR5-8/11: mount-time already-submitted ---------------------------------

describe('already-submitted state (FR5-11)', () => {
  it('renders instead of the form when ref-status is COMPLETED under ONE_PER_REF', async () => {
    submissionPolicy = 'ONE_PER_REF';
    refStatus = 'COMPLETED';
    const el = mount({ 'external-ref': 'user-1' });
    const events = collect(el, 'fe-already-submitted');
    await waitFor(() => shadowText(el).includes('already submitted'));
    expect(shadowText(el)).toContain("You've already submitted this form.");
    expect(events).toEqual([{ externalRef: 'user-1' }]);
    expect(shadowText(el)).not.toContain('favorite food');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('takes no action on COMPLETED under MULTIPLE but reports it via fe-loaded', async () => {
    refStatus = 'COMPLETED';
    const el = mount({ 'external-ref': 'user-1' });
    const loaded = collect(el, 'fe-loaded');
    await waitFor(() => shadowText(el).includes('favorite food'));
    expect((loaded[0] as { refStatus?: string }).refStatus).toBe('COMPLETED');
  });

  it('a failing ref-status check degrades to rendering the form (server is the gate)', async () => {
    submissionPolicy = 'ONE_PER_REF';
    refStatusFails = true;
    const el = await mountReady({ 'external-ref': 'user-1' });
    expect(shadowText(el)).toContain('favorite food');
  });

  it('honors the alreadySubmittedMessage label override', async () => {
    submissionPolicy = 'ONE_PER_REF';
    refStatus = 'COMPLETED';
    const el = mount({
      'external-ref': 'user-1',
      labels: '{"alreadySubmittedMessage":"Ya has enviado este formulario."}',
    });
    await waitFor(() => shadowText(el).includes('Ya has enviado este formulario.'));
  });
});

// ---- FR5-6: 409 handling ----------------------------------------------------

describe('ALREADY_SUBMITTED 409s (FR5-6)', () => {
  it('swaps to already-submitted when response creation 409s', async () => {
    submissionPolicy = 'ONE_PER_REF';
    createConflict = true;
    const el = await mountReady({ 'external-ref': 'user-1' });
    const events = collect(el, 'fe-already-submitted');
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => shadowText(el).includes('already submitted'));
    expect(events).toEqual([{ externalRef: 'user-1' }]);
  });

  it('the complete-race loser sees already-submitted after filling, and the session is cleared', async () => {
    submissionPolicy = 'ONE_PER_REF';
    completeConflict = true;
    const el = await mountReady({ 'external-ref': 'user-1' });
    const events = collect(el, 'fe-already-submitted');
    const completedEvents = collect(el, 'fe-completed');

    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => shadowText(el).includes('anything else?'));
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeTruthy();

    clickByText(el, 'Finish');
    await waitFor(() => shadowText(el).includes('already submitted'));
    expect(events).toEqual([{ externalRef: 'user-1' }]);
    expect(completedEvents).toHaveLength(0);
    // FR5-11: the stored session can never complete — it must not resume.
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
