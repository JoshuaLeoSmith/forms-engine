/**
 * Phase-4 component tests: refresh-resilient sessions (FR4-1/2/3/4), the
 * in-memory definition preview mode (FR4-6/7), the strings override
 * (FR4-13/14), and the completion redirect (FR4-18).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index.js';
import type { FormsEngineElement } from '../src/index.js';
import { syntheticTabId } from '../src/core/index.js';
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
          id: 'idq1', code: 'q1', sectionTitle: 'Food', prompt: 'what is your favorite food?',
          type: 'TEXT_BOX', typeConfig: { size: 'MEDIUM', maxLength: null }, requirement: ALWAYS,
        }),
        q({
          id: 'idq2', code: 'q2', sectionTitle: 'Food', prompt: 'what is the best dessert?',
          type: 'RADIO',
          typeConfig: { options: [{ id: 'o1', label: 'Cake' }, { id: 'o2', label: 'Ice Cream' }] },
          visibility: {
            mode: 'CONDITIONAL',
            rule: {
              combinator: 'ALL',
              conditions: [{ source: 'QUESTION', questionCode: 'q1', operator: 'NOT_EQUALS', value: 'salad' }],
            },
          },
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
        q({ id: 'idq3', code: 'q3', prompt: 'anything else?', type: 'TEXT_BOX', typeConfig: { size: 'LARGE', maxLength: null } }),
      ],
    },
  ],
  tabs: [],
  questions: [],
};

const uploadDefinition: Definition = {
  schemaVersion: 2,
  steps: [],
  tabs: [],
  questions: [
    q({
      id: 'idresume', code: 'resume', prompt: 'upload your resume', type: 'FILE_UPLOAD',
      typeConfig: { allowedCategories: ['DOCUMENTS'], maxFiles: 2, maxFileSizeMb: 5, helperText: '' },
      requirement: ALWAYS,
    }),
  ],
};

const SESSION_KEY = 'forms-engine:http://backend.test|q_test';

// ---- fetch mock -------------------------------------------------------------

interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

interface StoredResponsePayload {
  status: 'IN_PROGRESS' | 'COMPLETED';
  versionNumber: number;
  answers: Record<string, unknown>;
  lastPosition: { stepId: string; tabId: string } | null;
  definition: Definition;
}

let calls: RecordedCall[];
let storedResponses: Record<string, StoredResponsePayload>;

function installFetchMock(): void {
  calls = [];
  storedResponses = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url: String(url), body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      const responseGet = /\/public\/v1\/responses\/([^/]+)$/.exec(String(url));
      if (method === 'GET' && responseGet) {
        const stored = storedResponses[responseGet[1]];
        return stored ? json(stored) : json({ message: 'not found' }, 404);
      }
      if (method === 'GET' && String(url).endsWith('/live')) {
        return json({ publicId: 'q_test', name: 'Test', versionNumber: 7, definition });
      }
      if (method === 'POST' && String(url).endsWith('/responses')) {
        return json({ responseId: 'r_test' });
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

async function mountLive(
  attrs: Record<string, string> = {},
  waitText = 'favorite food',
): Promise<FormsEngineElement> {
  const el = document.createElement('forms-engine') as FormsEngineElement;
  el.setAttribute('public-id', 'q_test');
  el.setAttribute('api-base', 'http://backend.test');
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  await waitFor(() => shadowText(el).includes(waitText));
  return el;
}

async function mountPreview(
  def: Definition,
  attrs: Record<string, string> = {},
  waitText = 'favorite food',
): Promise<FormsEngineElement> {
  const el = document.createElement('forms-engine') as FormsEngineElement;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.definition = def;
  document.body.appendChild(el);
  await waitFor(() => shadowText(el).includes(waitText));
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

function dropFiles(el: FormsEngineElement, code: string, files: File[]): void {
  const dropzone = el.shadowRoot!.querySelector(`[data-code="${code}"] .fe-dropzone`);
  if (!dropzone) {
    throw new Error(`no dropzone for ${code}`);
  }
  const event = new Event('drop', { bubbles: false, cancelable: true }) as Event & {
    dataTransfer: { files: File[] };
  };
  event.dataTransfer = { files };
  dropzone.dispatchEvent(event);
}

const pdfFile = (name = 'resume.pdf') => new File([new Uint8Array(2048)], name, { type: 'application/pdf' });

const storedSession = () => {
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as { responseId: string; versionNumber: number; savedAt: string }) : null;
};

beforeEach(() => {
  installFetchMock();
  window.sessionStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- FR4-1/2/3/4: refresh-resilient sessions --------------------------------

describe('session persistence (FR4-1..4)', () => {
  it('writes the sessionStorage entry when the response is created', async () => {
    const el = await mountLive();
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    const entry = storedSession();
    expect(entry?.responseId).toBe('r_test');
    expect(entry?.versionNumber).toBe(7);
    expect(entry?.savedAt).toBeTruthy();
  });

  it('resumes an IN_PROGRESS session against its pinned definition (FR4-2/3/4)', async () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ responseId: 'r_test', versionNumber: 7, savedAt: 'x' }),
    );
    storedResponses['r_test'] = {
      status: 'IN_PROGRESS',
      versionNumber: 7,
      answers: { q1: 'pizza' },
      lastPosition: { stepId: 's2', tabId: syntheticTabId('s2') },
      definition,
    };
    const resumed: unknown[] = [];
    const el = document.createElement('forms-engine') as FormsEngineElement;
    el.addEventListener('fe-resumed', (e) => resumed.push((e as CustomEvent).detail));
    el.setAttribute('public-id', 'q_test');
    el.setAttribute('api-base', 'http://backend.test');
    document.body.appendChild(el);
    await waitFor(() => shadowText(el).includes('anything else?'));

    expect(resumed).toHaveLength(1);
    expect((resumed[0] as { responseId: string }).responseId).toBe('r_test');
    expect((resumed[0] as { screenId: string }).screenId).toContain('s2');
    // Resumed against the pinned payload — /live was never fetched.
    expect(calls.some((c) => c.url.endsWith('/live'))).toBe(false);
    // Backward navigation to the earlier screen works and answers survived.
    clickByText(el, 'Back');
    await waitFor(() => shadowText(el).includes('favorite food'));
    const input = el.shadowRoot!.querySelector<HTMLInputElement>('[data-code="q1"] input');
    expect(input?.value).toBe('pizza');
  });

  it('clears the entry and starts fresh when the stored response is COMPLETED', async () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ responseId: 'r_test', versionNumber: 7, savedAt: 'x' }),
    );
    storedResponses['r_test'] = {
      status: 'COMPLETED',
      versionNumber: 7,
      answers: {},
      lastPosition: null,
      definition,
    };
    const el = await mountLive();
    expect(shadowText(el)).toContain('favorite food');
    expect(storedSession()).toBeNull();
    expect(calls.some((c) => c.url.endsWith('/live'))).toBe(true);
  });

  it('clears the entry and starts fresh when the stored response 404s (deleted, FR4-9)', async () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ responseId: 'r_gone', versionNumber: 7, savedAt: 'x' }),
    );
    const el = await mountLive();
    expect(shadowText(el)).toContain('favorite food');
    expect(storedSession()).toBeNull();
  });

  it('persist-session="false" disables both storing and resuming', async () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ responseId: 'r_test', versionNumber: 7, savedAt: 'x' }),
    );
    storedResponses['r_test'] = {
      status: 'IN_PROGRESS',
      versionNumber: 7,
      answers: { q1: 'pizza' },
      lastPosition: null,
      definition,
    };
    const el = await mountLive({ 'persist-session': 'false' });
    // No resume attempt: the stored entry is ignored entirely.
    expect(calls.some((c) => c.method === 'GET' && /\/responses\/r_test$/.test(c.url))).toBe(false);
    expect(shadowText(el)).toContain('favorite food');
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    // The pre-seeded entry is untouched; nothing new was written over it.
    expect(storedSession()?.savedAt).toBe('x');
  });

  it('completion clears the stored session (FR4-3)', async () => {
    const el = await mountLive();
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => shadowText(el).includes('anything else?'));
    expect(storedSession()).not.toBeNull();
    clickByText(el, 'Finish');
    await waitFor(() => shadowText(el).includes('Thank you'));
    expect(storedSession()).toBeNull();
  });
});

// ---- FR4-6/7: definition preview mode ---------------------------------------

describe('definition preview mode (FR4-6/7)', () => {
  it('runs fully in-memory: rules and gating live, zero network, zero storage', async () => {
    const completed: unknown[] = [];
    const el = await mountPreview(structuredClone(definition));
    el.addEventListener('fe-completed', (e) => completed.push((e as CustomEvent).detail));
    expect(shadowText(el)).toContain('favorite food');

    // Gating: required q1 blocks forward navigation.
    clickByText(el, 'Next');
    await waitFor(() => shadowText(el).includes('This question is required.'));

    // Rules: salad hides the dessert question, exactly as live.
    typeText(el, 'q1', 'salad');
    await waitFor(() => !shadowText(el).includes('best dessert'));
    typeText(el, 'q1', 'pizza');
    await waitFor(() => shadowText(el).includes('best dessert'));

    clickByText(el, 'Next');
    await waitFor(() => shadowText(el).includes('anything else?'));
    clickByText(el, 'Finish');
    await waitFor(() => shadowText(el).includes('Thank you'));
    expect(completed).toHaveLength(1);
    expect(completed[0]).toEqual({ responseId: null, preview: true });

    expect(calls).toHaveLength(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('assigning a new definition object resets all preview state (Reset)', async () => {
    const el = await mountPreview(structuredClone(definition));
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => shadowText(el).includes('anything else?'));

    el.definition = structuredClone(definition);
    await waitFor(() => shadowText(el).includes('favorite food'));
    const input = el.shadowRoot!.querySelector<HTMLInputElement>('[data-code="q1"] input');
    expect(input?.value).toBe('');
  });

  it('satisfies required uploads in-memory with a preview tag (FR4-7, P4-D2)', async () => {
    const el = await mountPreview(structuredClone(uploadDefinition), {}, 'upload your resume');
    clickByText(el, 'Finish');
    await waitFor(() => shadowText(el).includes('This question is required.'));

    dropFiles(el, 'resume', [pdfFile('cv.pdf')]);
    await waitFor(() => shadowText(el).includes('cv.pdf'));
    expect(shadowText(el)).toContain('preview — not uploaded');
    expect(calls).toHaveLength(0);

    clickByText(el, 'Finish');
    await waitFor(() => shadowText(el).includes('Thank you'));
    expect(calls).toHaveLength(0);
  });

  it('pre-checks still run in preview: an oversized file is rejected locally', async () => {
    const el = await mountPreview(structuredClone(uploadDefinition), {}, 'upload your resume');
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    dropFiles(el, 'resume', [big]);
    await waitFor(() => shadowText(el).includes('larger than the 5 MB limit'));
    expect(shadowText(el)).not.toContain('preview — not uploaded');
    expect(calls).toHaveLength(0);
  });
});

// ---- FR4-13/14: strings override --------------------------------------------

describe('labels override (FR4-13/14)', () => {
  it('overrides supplied keys and falls back to English for the rest', async () => {
    const el = await mountPreview(structuredClone(definition), {
      labels: JSON.stringify({ next: 'Siguiente', requiredError: 'Este campo es obligatorio' }),
    });
    clickByText(el, 'Siguiente');
    await waitFor(() => shadowText(el).includes('Este campo es obligatorio'));
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Siguiente');
    // Fallback: Back and Finish were not overridden.
    await waitFor(() => shadowText(el).includes('Back') && shadowText(el).includes('Finish'));
  });

  it('interpolates {name} placeholders and reaches registry validation messages', async () => {
    const def: Definition = {
      schemaVersion: 2,
      steps: [],
      tabs: [],
      questions: [
        q({
          id: 'idcb', code: 'cb', prompt: 'pick some', type: 'CHECKBOX',
          typeConfig: {
            options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
            maxSelections: 2,
          },
        }),
        q({ id: 'idmail', code: 'mail', prompt: 'your email', type: 'EMAIL' }),
      ],
    };
    const el = await mountPreview(
      def,
      { labels: JSON.stringify({ checkboxMaxHint: 'Máximo {n} opciones', formatErrorEmail: 'Correo inválido' }) },
      'pick some',
    );
    expect(shadowText(el)).toContain('Máximo 2 opciones');
    typeText(el, 'mail', 'not-an-email');
    await waitFor(() => shadowText(el).includes('Correo inválido'));
  });

  it('ignores unknown keys and survives malformed JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = await mountPreview(structuredClone(definition), { labels: '{not json' });
    expect(shadowText(el)).toContain('Next');
    expect(warn).toHaveBeenCalled();
  });
});

// ---- FR4-18: completion redirect --------------------------------------------

describe('completion redirect (FR4-18)', () => {
  async function completeWithRedirect(redirect: string): Promise<{ order: string[]; target: string | null }> {
    const order: string[] = [];
    let target: string | null = null;
    const el = await mountLive({ 'completion-redirect': redirect });
    (el as unknown as { redirectTo: (href: string) => void }).redirectTo = (href: string) => {
      order.push('redirect');
      target = href;
    };
    el.addEventListener('fe-completed', () => order.push('completed'));
    typeText(el, 'q1', 'pizza');
    clickByText(el, 'Next');
    await waitFor(() => shadowText(el).includes('anything else?'));
    clickByText(el, 'Finish');
    await waitFor(() => shadowText(el).includes('Thank you'));
    return { order, target };
  }

  it('navigates after fe-completed for an http(s) URL (P4-D6)', async () => {
    const { order, target } = await completeWithRedirect('https://example.com/thanks');
    expect(order).toEqual(['completed', 'redirect']);
    expect(target).toBe('https://example.com/thanks');
  });

  it('ignores non-http(s) schemes with a console warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { order } = await completeWithRedirect('javascript:alert(1)');
    expect(order).toEqual(['completed']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('completion-redirect ignored'));
  });
});
