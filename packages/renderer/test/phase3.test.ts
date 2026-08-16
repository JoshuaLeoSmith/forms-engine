/**
 * Phase-3 component tests (Phase 3 §5.3, FR3-8/9/10/11/17/18/20): the
 * FILE_UPLOAD dropzone, immediate uploads with progress + cancel + retry,
 * client pre-checks, gating interplay (in-flight uploads block forward
 * navigation), response creation on first upload, removal, and best-effort
 * deletes on rule-driven clearing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index.js';
import type { FormsEngineElement } from '../src/index.js';
import { FILE_UPLOAD, fileUploadConstraintSummary, formatBytes } from '../src/index.js';
import type { AnswersMap, Definition, FileReference, QuestionDef, RuleConfig } from '../src/core/index.js';

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
          id: 'idresume', code: 'resume', prompt: 'upload your resume', type: 'FILE_UPLOAD',
          typeConfig: { allowedCategories: ['DOCUMENTS'], maxFiles: 2, maxFileSizeMb: 1, helperText: 'PDF preferred' },
          requirement: ALWAYS,
        }),
        q({
          id: 'idtgl', code: 'hasPortfolio', prompt: 'do you have a portfolio?', type: 'TOGGLE',
          typeConfig: { trueLabel: 'Yes', falseLabel: 'No' },
        }),
        q({
          id: 'idport', code: 'portfolio', prompt: 'portfolio images', type: 'FILE_UPLOAD',
          typeConfig: { allowedCategories: ['IMAGES'], maxFiles: 1, maxFileSizeMb: 5, helperText: '' },
          visibility: {
            mode: 'CONDITIONAL',
            rule: {
              combinator: 'ALL',
              conditions: [
                { source: 'QUESTION', questionCode: 'hasPortfolio', operator: 'EQUALS', value: true },
              ],
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
        q({ id: 'idq9', code: 'q9', prompt: 'anything else?', type: 'TEXT_BOX', typeConfig: { size: 'MEDIUM', maxLength: null } }),
      ],
    },
  ],
  tabs: [],
  questions: [],
};

// ---- fetch mock (definition load, response creation, PATCH, DELETE) --------

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
        return json({ publicId: 'q_p3', name: 'P3', versionNumber: 1, definition });
      }
      if (method === 'POST' && String(url).endsWith('/responses')) {
        return json({ responseId: 'r_p3' });
      }
      return json({}, 200);
    }),
  );
}

// ---- controllable XMLHttpRequest fake for uploads --------------------------

type Listener = (event: unknown) => void;

class FakeXHR {
  static instances: FakeXHR[] = [];

  method = '';
  url = '';
  status = 0;
  responseText = '';
  sentBody: FormData | null = null;
  aborted = false;

  private listeners: Record<string, Listener[]> = {};
  private progressCb: Listener | null = null;

  readonly upload = {
    addEventListener: (type: string, cb: Listener) => {
      if (type === 'progress') {
        this.progressCb = cb;
      }
    },
  };

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  addEventListener(type: string, cb: Listener): void {
    (this.listeners[type] ??= []).push(cb);
  }

  send(body: FormData): void {
    this.sentBody = body;
    FakeXHR.instances.push(this);
  }

  abort(): void {
    this.aborted = true;
    this.fire('abort');
  }

  fire(type: string): void {
    for (const cb of this.listeners[type] ?? []) {
      cb({});
    }
  }

  respond(status: number, data: unknown): void {
    this.status = status;
    this.responseText = JSON.stringify(data);
    this.fire('load');
  }

  progress(loaded: number, total: number): void {
    this.progressCb?.({ lengthComputable: true, loaded, total });
  }
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

async function mount(): Promise<FormsEngineElement> {
  const el = document.createElement('forms-engine') as FormsEngineElement;
  el.setAttribute('public-id', 'q_p3');
  el.setAttribute('api-base', 'http://backend.test');
  document.body.appendChild(el);
  await waitFor(() => !!el.shadowRoot?.textContent?.includes('resume'));
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

/** Drops files on a question's dropzone (jsdom lacks a DataTransfer ctor). */
function dropFiles(el: FormsEngineElement, code: string, files: File[]): void {
  const dropzone = root(el, code).querySelector('.fe-dropzone');
  if (!dropzone) {
    throw new Error(`no dropzone for ${code}`);
  }
  const event = new Event('drop', { bubbles: false, cancelable: true }) as Event & {
    dataTransfer: { files: File[] };
  };
  event.dataTransfer = { files };
  dropzone.dispatchEvent(event);
}

function pdfFile(name = 'resume.pdf', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

const REF: FileReference = {
  fileId: 'f_abc123',
  fileName: 'resume.pdf',
  size: 482113,
  contentType: 'application/pdf',
};

function lastPatchAnswers(): AnswersMap {
  const patches = calls.filter((c) => c.method === 'PATCH');
  return (patches[patches.length - 1]!.body as { answers: AnswersMap }).answers;
}

beforeEach(() => {
  installFetchMock();
  FakeXHR.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('FILE_UPLOAD core module', () => {
  it('validates config per §5.1 and answers per §4.2', () => {
    expect(FILE_UPLOAD.validateConfig({ allowedCategories: ['DOCUMENTS'], maxFiles: 2, maxFileSizeMb: 10 })).toEqual([]);
    expect(FILE_UPLOAD.validateConfig({ allowedCategories: [], maxFiles: 1, maxFileSizeMb: 10 })).toContain(
      'at least one file category is required',
    );
    expect(FILE_UPLOAD.validateConfig({ allowedCategories: ['MOVIES'], maxFiles: 1, maxFileSizeMb: 10 })).toContain(
      'unknown file category: MOVIES',
    );
    expect(FILE_UPLOAD.validateConfig({ allowedCategories: ['TEXT'], maxFiles: 11, maxFileSizeMb: 10 })).toContain(
      'maxFiles must be an integer between 1 and 10',
    );
    expect(FILE_UPLOAD.allowedOperators).toEqual([]);
    expect(FILE_UPLOAD.isAnswered(undefined, {})).toBe(false);
    expect(FILE_UPLOAD.isAnswered([], {})).toBe(false);
    expect(FILE_UPLOAD.isAnswered([REF], {})).toBe(true);
  });

  it('builds the constraint summary and human-readable sizes (FR3-16/17)', () => {
    expect(
      fileUploadConstraintSummary({ allowedCategories: ['DOCUMENTS'], maxFiles: 2, maxFileSizeMb: 10 }),
    ).toBe('PDF, DOC, DOCX · up to 2 files · 10 MB each');
    expect(
      fileUploadConstraintSummary({ allowedCategories: ['IMAGES'], maxFiles: 1, maxFileSizeMb: 5 }),
    ).toBe('JPG, JPEG, PNG, GIF, WEBP · 1 file · 5 MB each');
    expect(formatBytes(482113)).toBe('471 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB');
  });
});

describe('<forms-engine> Phase 3', () => {
  it('renders the dropzone with constraint summary and helper text (FR3-16/17)', async () => {
    const el = await mount();
    const text = root(el, 'resume').textContent ?? '';
    expect(text).toContain('PDF, DOC, DOCX · up to 2 files · 1 MB each');
    expect(text).toContain('PDF preferred');
  });

  it('uploads on selection, creates the response first (FR3-8), blocks Next while in flight (FR3-18), and stores the reference array (FR3-9)', async () => {
    const el = await mount();
    clickNext(el);
    await el.updateComplete;
    expect(shadowText(el)).toContain('This question is required.');
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/responses'))).toBe(false);

    dropFiles(el, 'resume', [pdfFile()]);
    // FR3-8: the response is created before the transfer starts.
    await waitFor(() => FakeXHR.instances.length === 1);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/responses'))).toBe(true);
    const xhr = FakeXHR.instances[0]!;
    expect(xhr.url).toContain('/public/v1/responses/r_p3/files');

    xhr.progress(50, 100);
    await el.updateComplete;
    const bar = root(el, 'resume').querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');

    clickNext(el);
    await el.updateComplete;
    expect(shadowText(el)).toContain('Waiting for the upload to finish.');

    xhr.respond(201, REF);
    await waitFor(() => (root(el, 'resume').textContent ?? '').includes('471 KB'));
    clickNext(el);
    await waitFor(() => calls.some((c) => c.method === 'PATCH'));
    expect(lastPatchAnswers()['resume']).toEqual([REF]);
  });

  it('pre-checks size and extension client-side without transmitting (FR3-17)', async () => {
    const el = await mount();
    dropFiles(el, 'resume', [pdfFile('big.pdf', 2 * 1024 * 1024)]);
    await el.updateComplete;
    expect(root(el, 'resume').textContent).toContain('larger than the 1 MB limit');
    dropFiles(el, 'resume', [pdfFile('script.exe')]);
    await el.updateComplete;
    expect(root(el, 'resume').textContent).toContain("isn't accepted");
    expect(FakeXHR.instances.length).toBe(0);
  });

  it('rejects the surplus when more files than remaining slots are selected (FR3-17)', async () => {
    const el = await mount();
    dropFiles(el, 'resume', [pdfFile('a.pdf'), pdfFile('b.pdf'), pdfFile('c.pdf')]);
    await waitFor(() => FakeXHR.instances.length === 2);
    await el.updateComplete;
    expect(root(el, 'resume').textContent).toContain('can be added');
    expect(FakeXHR.instances.length).toBe(2);
  });

  it('cancelled uploads disappear and do not block navigation (FR3-18)', async () => {
    const el = await mount();
    dropFiles(el, 'resume', [pdfFile()]);
    await waitFor(() => FakeXHR.instances.length === 1);
    await el.updateComplete;
    clickByText(root(el, 'resume'), '×');
    await waitFor(() => FakeXHR.instances[0]!.aborted);
    await el.updateComplete;
    clickNext(el);
    await el.updateComplete;
    // Blocked by requiredness, not by a phantom in-flight upload.
    expect(shadowText(el)).toContain('This question is required.');
    expect(shadowText(el)).not.toContain('Waiting for the upload to finish.');
  });

  it('failed uploads show the server message with a user-triggered retry (FR3-20) and emit fe-error (FR3-18)', async () => {
    const el = await mount();
    const errors: string[] = [];
    el.addEventListener('fe-error', ((e: CustomEvent<{ code?: string }>) => {
      if (e.detail?.code) {
        errors.push(e.detail.code);
      }
    }) as EventListener);
    dropFiles(el, 'resume', [pdfFile()]);
    await waitFor(() => FakeXHR.instances.length === 1);
    FakeXHR.instances[0]!.respond(400, { status: 400, message: 'file content does not match its extension', errors: [] });
    await waitFor(() => (root(el, 'resume').textContent ?? '').includes('does not match'));
    expect(errors).toContain('FILE_UPLOAD_FAILED');

    clickByText(root(el, 'resume'), 'Retry');
    await waitFor(() => FakeXHR.instances.length === 2);
    FakeXHR.instances[1]!.respond(201, REF);
    await waitFor(() => (root(el, 'resume').textContent ?? '').includes('471 KB'));
  });

  it('removal drops the reference and issues the DELETE (FR3-10)', async () => {
    const el = await mount();
    dropFiles(el, 'resume', [pdfFile()]);
    await waitFor(() => FakeXHR.instances.length === 1);
    FakeXHR.instances[0]!.respond(201, REF);
    await waitFor(() => (root(el, 'resume').textContent ?? '').includes('471 KB'));

    clickByText(root(el, 'resume'), '×');
    await waitFor(() => calls.some((c) => c.method === 'DELETE' && c.url.includes('/files/f_abc123')));
    await el.updateComplete;
    clickNext(el);
    await el.updateComplete;
    expect(shadowText(el)).toContain('This question is required.');
  });

  it('rule-driven clearing best-effort-deletes the referenced files (FR3-11)', async () => {
    const el = await mount();
    clickByText(root(el, 'hasPortfolio'), 'Yes');
    await el.updateComplete;
    const portfolioRef: FileReference = {
      fileId: 'f_img1', fileName: 'photo.png', size: 2048, contentType: 'image/png',
    };
    dropFiles(el, 'portfolio', [new File([new Uint8Array(2048)], 'photo.png', { type: 'image/png' })]);
    await waitFor(() => FakeXHR.instances.length === 1);
    FakeXHR.instances[0]!.respond(201, portfolioRef);
    await waitFor(() => (root(el, 'portfolio').textContent ?? '').includes('photo.png'));

    clickByText(root(el, 'hasPortfolio'), 'No');
    await waitFor(() => calls.some((c) => c.method === 'DELETE' && c.url.includes('/files/f_img1')));
    expect(el.shadowRoot!.querySelector('[data-code="portfolio"]')).toBeNull();
  });
});
