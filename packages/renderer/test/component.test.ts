/**
 * Component tests (NFR-7): gating, clearing cascade, lazy response creation,
 * version pinning, completion. Runs in jsdom with a mocked fetch backend.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index.js';
import type { FormsEngineElement } from '../src/index.js';
import type { Definition } from '../src/core/index.js';

const definition: Definition = {
  schemaVersion: 1,
  steps: [
    {
      id: 's1',
      title: 'Step 1',
      visibility: { mode: 'ALWAYS' },
      requirement: { mode: 'NEVER' },
      tabs: [],
      questions: [
        {
          id: 'idq1', code: 'q1', sectionTitle: 'Food', prompt: 'what is your favorite food?',
          type: 'TEXT_BOX', width: 'DEFAULT', typeConfig: { size: 'MEDIUM' },
          visibility: { mode: 'ALWAYS' }, requirement: { mode: 'ALWAYS' },
        },
        {
          id: 'idq2', code: 'q2', sectionTitle: 'Food', prompt: 'what is the best dessert?',
          type: 'RADIO', width: 'DEFAULT',
          typeConfig: { options: [{ id: 'o1', label: 'Cake' }, { id: 'o2', label: 'Ice Cream' }] },
          visibility: {
            mode: 'CONDITIONAL',
            rule: {
              combinator: 'ALL',
              conditions: [{ source: 'QUESTION', questionCode: 'q1', operator: 'NOT_EQUALS', value: 'salad' }],
            },
          },
          requirement: { mode: 'NEVER' },
        },
      ],
    },
    {
      id: 's2',
      title: 'Step 2',
      visibility: { mode: 'ALWAYS' },
      requirement: { mode: 'NEVER' },
      tabs: [],
      questions: [
        {
          id: 'idq3', code: 'q3', sectionTitle: '', prompt: 'anything else?',
          type: 'TEXT_BOX', width: 'DEFAULT', typeConfig: { size: 'LARGE' },
          visibility: { mode: 'ALWAYS' }, requirement: { mode: 'NEVER' },
        },
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
let patchStatus: number;

function installFetchMock(): void {
  calls = [];
  patchStatus = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url: String(url), body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (String(url).includes('q_missing')) {
        return json({ message: 'not found' }, 404);
      }
      if (method === 'GET' && String(url).endsWith('/live')) {
        return json({ publicId: 'q_test', name: 'Test', versionNumber: 7, definition });
      }
      if (method === 'POST' && String(url).endsWith('/responses')) {
        return json({ responseId: 'r_test' });
      }
      if (method === 'PATCH') {
        return json({}, patchStatus);
      }
      if (method === 'POST' && String(url).endsWith('/complete')) {
        return json({});
      }
      return json({ message: 'not found' }, 404);
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

async function mountElement(): Promise<FormsEngineElement> {
  const el = document.createElement('forms-engine') as FormsEngineElement;
  el.setAttribute('public-id', 'q_test');
  el.setAttribute('api-base', 'http://backend.test');
  document.body.appendChild(el);
  await waitFor(() => !!el.shadowRoot?.textContent?.includes('favorite food'));
  return el;
}

function shadowText(el: FormsEngineElement): string {
  return el.shadowRoot?.textContent ?? '';
}

function typeText(el: FormsEngineElement, code: string, value: string): void {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>(`[data-code="${code}"] input, [data-code="${code}"] textarea`);
  if (!input) {
    throw new Error(`no input for ${code}`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clickButton(el: FormsEngineElement, label: string): void {
  const buttons = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')];
  const button = buttons.find((b) => (b.textContent ?? '').replace(/\s+/g, ' ').includes(label));
  if (!button) {
    throw new Error(`no button "${label}"`);
  }
  button.click();
}

function chooseRadio(el: FormsEngineElement, code: string, label: string): void {
  const radios = [...el.shadowRoot!.querySelectorAll<HTMLInputElement>(`[data-code="${code}"] input[type=radio]`)];
  const radio = radios.find((r) => r.value === label);
  if (!radio) {
    throw new Error(`no radio option "${label}"`);
  }
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('<forms-engine>', () => {
  it('loads the live definition, emits fe-loaded and renders the first screen', async () => {
    const el = document.createElement('forms-engine') as FormsEngineElement;
    const loaded = vi.fn();
    el.addEventListener('fe-loaded', loaded);
    el.setAttribute('public-id', 'q_test');
    el.setAttribute('api-base', 'http://backend.test');
    document.body.appendChild(el);
    await waitFor(() => loaded.mock.calls.length > 0);
    expect(shadowText(el)).toContain('favorite food');
    // Conditional question hidden while q1 unanswered (§6.3).
    expect(shadowText(el)).not.toContain('best dessert');
  });

  it('renders an inline error state and emits fe-error when the questionnaire is missing', async () => {
    const el = document.createElement('forms-engine') as FormsEngineElement;
    const error = vi.fn();
    el.addEventListener('fe-error', error);
    el.setAttribute('public-id', 'q_missing_route');
    el.setAttribute('api-base', 'http://backend.test/unknown');
    document.body.appendChild(el);
    await waitFor(() => error.mock.calls.length > 0);
    expect(shadowText(el)).toContain('Something went wrong');
  });

  it('blocks forward navigation on required questions and creates no response (FR-L-5, FR-L-8)', async () => {
    const el = await mountElement();
    clickButton(el, 'Next');
    await el.updateComplete;
    expect(shadowText(el)).toContain('This question is required.');
    expect(shadowText(el)).toContain('favorite food'); // still on screen 1
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('creates the response lazily on first forward navigation, pinned to the loaded version (FR-L-8/9)', async () => {
    const el = await mountElement();
    typeText(el, 'q1', 'pizza');
    clickButton(el, 'Next');
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/responses'));
    expect(create?.body).toEqual({ versionNumber: 7 });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toContain('/public/v1/responses/r_test');
    expect(patch?.body).toMatchObject({
      answers: { q1: 'pizza' },
      lastPosition: { stepId: 's2' },
    });
    // The definition is fetched exactly once — never re-fetched mid-session (FR-L-9).
    expect(calls.filter((c) => c.method === 'GET' && c.url.endsWith('/live'))).toHaveLength(1);
  });

  it('shows the conditional question, then hides and clears it when the rule flips (clearing cascade, §6.7)', async () => {
    const el = await mountElement();
    typeText(el, 'q1', 'pizza');
    await el.updateComplete;
    expect(shadowText(el)).toContain('best dessert');
    chooseRadio(el, 'q2', 'Cake');
    await el.updateComplete;
    typeText(el, 'q1', 'salad');
    await el.updateComplete;
    expect(shadowText(el)).not.toContain('best dessert');
    typeText(el, 'q1', 'pasta');
    clickButton(el, 'Next');
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    const patch = calls.find((c) => c.method === 'PATCH');
    // Full-replace answers: the cleared q2 answer is gone server-side (D-7),
    // and the reappeared question is blank, not restored (D-3).
    expect((patch!.body as { answers: Record<string, string> }).answers).toEqual({ q1: 'pasta' });
  });

  it('completes: final PATCH, POST /complete, fe-completed, thank-you state (FR-L-11)', async () => {
    const el = await mountElement();
    const completed = vi.fn();
    el.addEventListener('fe-completed', completed);
    typeText(el, 'q1', 'pizza');
    clickButton(el, 'Next');
    await waitFor(() => shadowText(el).includes('anything else'));
    clickButton(el, 'Finish');
    await waitFor(() => completed.mock.calls.length > 0);
    const order = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url.split('/public/v1')[1]}`);
    expect(order[order.length - 1]).toBe('POST /responses/r_test/complete');
    expect((completed.mock.calls[0][0] as CustomEvent).detail).toEqual({ responseId: 'r_test' });
    expect(shadowText(el)).toContain('Thank you');
  });

  it('supports free backward navigation and re-gates forward moves (FR-L-5)', async () => {
    const el = await mountElement();
    typeText(el, 'q1', 'pizza');
    clickButton(el, 'Next');
    await waitFor(() => shadowText(el).includes('anything else'));
    clickButton(el, 'Back');
    await waitFor(() => shadowText(el).includes('favorite food'));
    // Previously visited step is freely reachable from the stepper.
    clickButton(el, 'Step 2');
    await waitFor(() => shadowText(el).includes('anything else'));
  });

  it('surfaces a non-blocking banner and fe-error when saves fail (FR-L-12)', async () => {
    const el = await mountElement();
    const error = vi.fn();
    el.addEventListener('fe-error', error);
    patchStatus = 400;
    typeText(el, 'q1', 'pizza');
    clickButton(el, 'Next');
    await waitFor(() => error.mock.calls.length > 0);
    await el.updateComplete;
    expect(shadowText(el)).toContain("answers aren't saving");
    // Respondent is not blocked: navigation still happened.
    expect(shadowText(el)).toContain('anything else');
  });
});
