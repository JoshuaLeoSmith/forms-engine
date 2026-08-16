/**
 * <forms-engine> — the live questionnaire web component (BRD §8).
 *
 * Attributes: public-id (required), api-base (required), theme (reserved),
 * persist-session (Phase 4 FR4-1, default true), completion-redirect (FR4-18),
 * labels (FR4-13 strings override, JSON), external-ref (Phase 5 FR5-1 — the
 * host application's opaque identity label, honor-system only). Property-only
 * input: `definition` — inline draft-preview mode, fully in-memory (FR4-6).
 * Events: fe-loaded, fe-screen-changed, fe-completed, fe-error (FR-L-1),
 * fe-resumed (FR4-4), fe-already-submitted (FR5-11).
 */
import { html, LitElement, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import {
  ApiClient,
  isAlreadySubmitted,
  type StoredResponse,
  type SubmissionPolicy,
} from '../api/client.js';
import {
  evaluate,
  isGateable,
  type EvaluationResult,
} from '../core/engine.js';
import {
  DEFAULT_LABELS,
  defaultMessages,
  messagesFor,
  resolveLabels,
  type LabelKey,
  type MessageResolver,
} from '../core/labels.js';
import {
  groupSections,
  normalize,
  type NormalizedDefinition,
  type NormalizedStep,
  type NormalizedTab,
} from '../core/normalize.js';
import { getQuestionType } from '../core/registry.js';
import type {
  AnswersMap,
  AnswerValue,
  Definition,
  FileReference,
  QuestionDef,
  ScreenPosition,
} from '../core/types.js';
import { UploadAbortedError, type UploadHandle } from '../api/client.js';
import { getQuestionRenderer } from './question-renderers.js';
import type { UploadContext } from './fe-upload.js';
import { formsEngineStyles } from './styles.js';

type Phase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'completed'
  | 'error'
  // Phase 5: terminal external-reference states (FR5-5/11).
  | 'already-submitted'
  | 'config-error';

/** FR5-1: external reference constraint — 1–128 chars after trim. */
const MAX_EXTERNAL_REF_LENGTH = 128;

interface Screen {
  step: NormalizedStep;
  tab: NormalizedTab;
}

const screenKey = (stepId: string, tabId: string) => `${stepId}::${tabId}`;

export class FormsEngineElement extends LitElement {
  static override styles = formsEngineStyles;

  static override properties = {
    publicId: { attribute: 'public-id', type: String },
    apiBase: { attribute: 'api-base', type: String },
    theme: { attribute: 'theme', type: String },
    // FR4-1: default true; the literal attribute value "false" disables it.
    persistSession: { attribute: 'persist-session', converter: (v: string | null) => v !== 'false' },
    completionRedirect: { attribute: 'completion-redirect', type: String },
    // FR5-1: supplied at mount; mid-session changes are ignored with a warning.
    externalRef: { attribute: 'external-ref', type: String },
    // Accepts a JSON string as an attribute or a plain object as a property;
    // resolveLabels handles both (FR4-13).
    labels: { attribute: 'labels', converter: (v: string | null) => v },
    definition: { attribute: false },
    _phase: { state: true },
    _errorKey: { state: true },
    _saveFailed: { state: true },
    _current: { state: true },
    _invalidCodes: { state: true },
    _fieldErrors: { state: true },
    _uploadBusy: { state: true },
    _announcement: { state: true },
    _completing: { state: true },
    _evalResult: { state: true },
  };

  publicId = '';
  apiBase = '';
  /** Reserved for future themes; v1 ships one default theme (FR-L-1). */
  theme = '';
  /** FR4-1: refresh-resilient sessions via sessionStorage; false restores Phase-3 behavior. */
  persistSession = true;
  /** FR4-18: absolute http(s) URL to navigate to after a successful completion. */
  completionRedirect = '';
  /**
   * FR5-1: opaque external reference identifying the respondent in the host
   * application's own terms. Spoofable by design (honor-system dedup, not a
   * security boundary). Captured at mount; a session belongs to one ref.
   */
  externalRef = '';
  /** FR4-13: per-key overrides of the built-in strings; JSON string or object. */
  labels: unknown = null;
  /**
   * FR4-6: inline definition = draft-preview mode. Mutually exclusive with
   * public-id/api-base; the component runs fully in-memory — no response
   * creation, no saves, no completion call, no sessionStorage. Assigning a
   * NEW object identity restarts the preview cleanly (the overlay's Reset).
   */
  definition: Definition | null = null;

  private _phase: Phase = 'idle';
  private _errorKey: LabelKey = 'loadErrorGeneric';
  private _saveFailed = false;
  private _completing = false;
  private _announcement = '';
  private _invalidCodes: ReadonlySet<string> = new Set();
  /**
   * Transient input errors reported by renderers (unparseable text that never
   * became an answer, §6.4). These block navigation like missing required
   * answers (FR2-9-adjacent gating).
   */
  private _fieldErrors: ReadonlyMap<string, string> = new Map();
  /**
   * In-flight upload counts per question code (FR3-18). Tracked host-side —
   * not in the upload control — so the count survives the control unmounting
   * on backward navigation and can never go stale.
   */
  private _uploadBusy: ReadonlyMap<string, number> = new Map();

  private client: ApiClient | null = null;
  private norm: NormalizedDefinition | null = null;
  private versionNumber = 0;
  /** FR5-12: from the live/rehydration payload; UI signal only. */
  private submissionPolicy: SubmissionPolicy = 'MULTIPLE';
  /** FR5-1: the ref captured at mount — the session's single identity claim. */
  private sessionRef: string | null = null;
  private refCaptured = false;
  private refChangeWarned = false;
  private answers: AnswersMap = {};
  private _evalResult: EvaluationResult | null = null;
  private _current: ScreenPosition | null = null;
  private readonly visited = new Set<string>();

  private responseId: string | null = null;
  private responseCreation: Promise<string> | null = null;
  private pendingSave: { answers: AnswersMap; lastPosition: ScreenPosition } | null = null;
  private drainPromise: Promise<void> | null = null;

  private loadedFor = '';
  private loadedDefinition: Definition | null = null;
  /** Monotonic ids for synthetic preview file references (FR4-7). */
  private previewUploadCounter = 0;

  // ---- labels (FR4-13) -----------------------------------------------------

  private labelsInput: unknown = undefined;
  private resolvedMessages: MessageResolver = defaultMessages;

  /** Resolves lazily and re-resolves only when the `labels` input changes. */
  private messages(): MessageResolver {
    if (this.labels !== this.labelsInput) {
      this.labelsInput = this.labels;
      this.resolvedMessages =
        this.labels == null ? defaultMessages : messagesFor(resolveLabels(this.labels));
    }
    return this.resolvedMessages;
  }

  private msg(key: LabelKey, params?: Record<string, string | number>): string {
    return this.messages()(key, params);
  }

  /** FR4-6: an inline definition puts the component in in-memory preview mode. */
  private get preview(): boolean {
    return this.definition !== null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.maybeLoad();
  }

  override willUpdate(): void {
    this.warnOnRefChange();
    this.maybeLoad();
  }

  /** FR5-1: trim + length cap; empty or invalid → null (treated as absent). */
  private normalizeRef(raw: string): string | null {
    const ref = (raw ?? '').trim();
    if (ref.length === 0) {
      return null;
    }
    if (ref.length > MAX_EXTERNAL_REF_LENGTH) {
      console.warn(
        `forms-engine: external-ref is ${ref.length} characters (max ${MAX_EXTERNAL_REF_LENGTH}); ignoring it`,
      );
      return null;
    }
    return ref;
  }

  /** FR5-1 (P5-D4): changing external-ref mid-session is ignored with a warning. */
  private warnOnRefChange(): void {
    if (!this.refCaptured || this.refChangeWarned) {
      return;
    }
    if (this.normalizeRef(this.externalRef) !== this.sessionRef) {
      this.refChangeWarned = true;
      console.warn(
        'forms-engine: external-ref changed mid-session; ignoring the new value — a session belongs to one reference',
      );
    }
  }

  private maybeLoad(): void {
    if (this.definition) {
      // Object identity is the reload trigger: the preview overlay's Reset
      // assigns a fresh clone to start clean (FR4-6).
      if (this.loadedDefinition !== this.definition) {
        this.loadedDefinition = this.definition;
        this.loadedFor = '';
        this.loadInline(this.definition);
      }
      return;
    }
    const key = `${this.apiBase}|${this.publicId}`;
    if (!this.publicId || !this.apiBase || this.loadedFor === key) {
      return;
    }
    this.loadedFor = key;
    void this.load();
  }

  private emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private emitError(message: string, cause?: unknown): void {
    this.emit('fe-error', { message, cause });
  }

  private async load(): Promise<void> {
    this._phase = 'loading';
    this.client = new ApiClient(this.apiBase);
    // FR5-1 (P5-D4): one session, one identity claim — captured here, before
    // anything network-visible happens; later attribute changes only warn.
    this.sessionRef = this.normalizeRef(this.externalRef);
    this.refCaptured = true;
    // FR4-3: a stored session is checked BEFORE fetching /live — a refreshed
    // respondent must resume against their pinned version, not the latest.
    // This deliberately precedes the Phase-5 mount checks: same-device resume
    // of an IN_PROGRESS session stays legal under any policy (P5-D2); the
    // server still has the last word at completion time (FR5-6).
    if (this.persistSession) {
      const stored = this.readSession();
      if (stored) {
        try {
          const response = await this.client.fetchResponse(stored.responseId);
          if (response.status === 'IN_PROGRESS') {
            this.rehydrate(stored.responseId, response);
            return;
          }
          this.clearSession();
        } catch (err) {
          // 404 = the response was deleted server-side (FR4-9); the stored id
          // is dead, so clear it. Transient failures keep the entry — the
          // fresh session below overwrites it on its first save anyway.
          if ((err as { status?: number })?.status === 404) {
            this.clearSession();
          }
        }
      }
    }
    try {
      const live = await this.client.fetchLive(this.publicId);
      this.submissionPolicy = live.submissionPolicy === 'ONE_PER_REF' ? 'ONE_PER_REF' : 'MULTIPLE';
      // FR5-5 (P5-D3): ONE_PER_REF without a ref fails loudly at mount —
      // silently rendering an unenforceable policy would hide the bug until
      // production.
      if (this.submissionPolicy === 'ONE_PER_REF' && !this.sessionRef) {
        this._phase = 'config-error';
        this.emit('fe-error', {
          code: 'EXTERNAL_REF_REQUIRED',
          message: 'This questionnaire requires an external-ref attribute (submission policy ONE_PER_REF)',
        });
        return;
      }
      // FR5-8: the mount-time check runs whenever a ref is supplied, any
      // policy; only ONE_PER_REF acts on it (FR5-11) — under MULTIPLE the
      // signal is passed to the host via fe-loaded.
      let refStatus: 'NONE' | 'COMPLETED' | undefined;
      if (this.sessionRef) {
        refStatus = await this.client.fetchRefStatus(this.publicId, this.sessionRef);
        if (refStatus === 'COMPLETED' && this.submissionPolicy === 'ONE_PER_REF') {
          this._phase = 'already-submitted';
          this.emit('fe-already-submitted', { externalRef: this.sessionRef });
          return;
        }
      }
      // The response is pinned to this version for the whole session; the
      // definition is never re-fetched mid-session (FR-L-9, D-5).
      this.startSession(live.definition, live.versionNumber);
      this.emit('fe-loaded', {
        publicId: this.publicId,
        versionNumber: this.versionNumber,
        ...(refStatus !== undefined ? { refStatus } : {}),
      });
    } catch (err) {
      this._phase = 'error';
      this._errorKey =
        err instanceof Error && /404/.test(err.message) ? 'loadErrorNotFound' : 'loadErrorGeneric';
      this.emitError('Failed to load questionnaire', err);
    }
  }

  /** FR4-6: preview mode boot — no network, no persistence, clean slate. */
  private loadInline(definition: Definition): void {
    this.client = null;
    this.responseId = null;
    this.responseCreation = null;
    this.pendingSave = null;
    this._saveFailed = false;
    this.startSession(definition, 0);
    this.emit('fe-loaded', { preview: true });
  }

  /** Shared boot path for live, preview, and rehydrated sessions. */
  private startSession(definition: Definition, versionNumber: number, answers: AnswersMap = {}): void {
    this.norm = normalize(definition);
    this.versionNumber = versionNumber;
    this.answers = answers;
    this.visited.clear();
    this._invalidCodes = new Set();
    this._fieldErrors = new Map();
    this._uploadBusy = new Map();
    this._announcement = '';
    this.reportUnknownTypes();
    this.runRules();
    const screens = this.visibleScreens();
    if (screens.length > 0) {
      this._current = { stepId: screens[0].step.id, tabId: screens[0].tab.id };
      this.visited.add(screenKey(screens[0].step.id, screens[0].tab.id));
    } else {
      this._current = null;
    }
    this._phase = 'ready';
  }

  /**
   * FR2-9/FR2-10: unknown or unparseable types degrade to a placeholder and
   * emit fe-error once per type per session — never a crash or a silent hole.
   */
  private reportUnknownTypes(): void {
    const reportedTypes = new Set<string>();
    for (const q of this.norm!.questions) {
      if (this.isFallback(q) && !reportedTypes.has(q.type)) {
        reportedTypes.add(q.type);
        this.emit('fe-error', {
          code: 'UNKNOWN_QUESTION_TYPE',
          type: q.type,
          message: `Question type ${q.type} requires a newer version of the form component`,
        });
      }
    }
  }

  /**
   * FR4-3: restore a stored IN_PROGRESS session against its pinned version's
   * definition (embedded in the FR4-2 payload). Lands on lastPosition when it
   * is still visible, else the nearest visible screen; every screen up to the
   * landing point is marked visited so free backward navigation survives the
   * refresh. Restored uploads reappear via the answers array as usual.
   */
  private rehydrate(responseId: string, response: StoredResponse): void {
    this.responseId = responseId;
    this.submissionPolicy = response.submissionPolicy === 'ONE_PER_REF' ? 'ONE_PER_REF' : 'MULTIPLE';
    this.startSession(response.definition, response.versionNumber, { ...response.answers });
    const screens = this.visibleScreens();
    if (screens.length > 0) {
      let index = response.lastPosition
        ? screens.findIndex(
            (s) => s.step.id === response.lastPosition!.stepId && s.tab.id === response.lastPosition!.tabId,
          )
        : -1;
      if (index < 0 && response.lastPosition) {
        index = this.nearestVisibleIndex(response.lastPosition);
      }
      if (index < 0) {
        index = 0;
      }
      for (let i = 0; i <= index; i++) {
        this.visited.add(screenKey(screens[i].step.id, screens[i].tab.id));
      }
      this._current = { stepId: screens[index].step.id, tabId: screens[index].tab.id };
    }
    this.emit('fe-loaded', { publicId: this.publicId, versionNumber: this.versionNumber });
    const current = this._current;
    this.emit('fe-resumed', {
      responseId,
      screenId: current ? screenKey(current.stepId, current.tabId) : null,
      ...(current ?? {}),
    });
  }

  /** Index (in visible order) of the visible screen nearest to a position. */
  private nearestVisibleIndex(position: ScreenPosition): number {
    const all = this.allScreens();
    const visible = this.visibleScreens();
    const anchor = all.findIndex((s) => s.step.id === position.stepId && s.tab.id === position.tabId);
    if (anchor < 0) {
      return -1;
    }
    for (let i = anchor + 1; i < all.length; i++) {
      const idx = visible.findIndex((s) => s.step.id === all[i].step.id && s.tab.id === all[i].tab.id);
      if (idx >= 0) {
        return idx;
      }
    }
    for (let i = anchor - 1; i >= 0; i--) {
      const idx = visible.findIndex((s) => s.step.id === all[i].step.id && s.tab.id === all[i].tab.id);
      if (idx >= 0) {
        return idx;
      }
    }
    return -1;
  }

  // ---- session persistence (FR4-1) ----------------------------------------

  private sessionStorageKey(): string {
    return `forms-engine:${this.apiBase}|${this.publicId}`;
  }

  /**
   * sessionStorage by design (P4-D1): survives refresh and same-tab
   * navigation without persisting across browser restarts. Unavailable
   * storage (some private-browsing modes) degrades silently.
   */
  private readSession(): { responseId: string; versionNumber: number; savedAt: string } | null {
    try {
      const raw = window.sessionStorage.getItem(this.sessionStorageKey());
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { responseId?: unknown; versionNumber?: unknown; savedAt?: unknown };
      if (typeof parsed.responseId !== 'string' || parsed.responseId.length === 0) {
        return null;
      }
      return {
        responseId: parsed.responseId,
        versionNumber: typeof parsed.versionNumber === 'number' ? parsed.versionNumber : 0,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      };
    } catch {
      return null;
    }
  }

  private writeSession(): void {
    if (!this.persistSession || this.preview || !this.responseId) {
      return;
    }
    try {
      window.sessionStorage.setItem(
        this.sessionStorageKey(),
        JSON.stringify({
          responseId: this.responseId,
          versionNumber: this.versionNumber,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Storage unavailable or full — degrade to Phase-3 behavior (FR4-1).
    }
  }

  private clearSession(): void {
    try {
      window.sessionStorage.removeItem(this.sessionStorageKey());
    } catch {
      // Ignore: nothing to clear if storage never worked.
    }
  }

  // ---- rules -------------------------------------------------------------

  private runRules(): void {
    if (!this.norm) {
      return;
    }
    const before = this.answers;
    const result = evaluate(this.norm, this.answers);
    if (result.capHit) {
      console.error('forms-engine: rule evaluation hit the fixpoint iteration cap; proceeding with current state');
    }
    this.answers = result.answers;
    this._evalResult = result;
    // FR3-11: when a rule hides a question whose answer referenced uploaded
    // files, issue best-effort deletes for them. Clearing never blocks on
    // network success — the orphan cleanup job is the safety net.
    for (const code of result.clearedCodes) {
      const previous = before[code];
      if (Array.isArray(previous)) {
        for (const element of previous) {
          if (typeof element === 'object' && element !== null && typeof (element as FileReference).fileId === 'string') {
            this.removeUploadedFile((element as FileReference).fileId);
          }
        }
      }
    }
    this.resolveCurrentScreen();
  }

  /** FR-L-6: if the current screen became invisible, advance to the nearest visible one. */
  private resolveCurrentScreen(): void {
    if (!this.norm || !this._current) {
      return;
    }
    const all = this.allScreens();
    const visible = this.visibleScreens();
    if (visible.some((s) => s.step.id === this._current!.stepId && s.tab.id === this._current!.tabId)) {
      return;
    }
    const currentIndex = all.findIndex(
      (s) => s.step.id === this._current!.stepId && s.tab.id === this._current!.tabId,
    );
    const visibleKeys = new Set(visible.map((s) => screenKey(s.step.id, s.tab.id)));
    let target: Screen | undefined;
    for (let i = currentIndex + 1; i < all.length; i++) {
      if (visibleKeys.has(screenKey(all[i].step.id, all[i].tab.id))) {
        target = all[i];
        break;
      }
    }
    if (!target) {
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (visibleKeys.has(screenKey(all[i].step.id, all[i].tab.id))) {
          target = all[i];
          break;
        }
      }
    }
    if (target) {
      this._current = { stepId: target.step.id, tabId: target.tab.id };
      this.visited.add(screenKey(target.step.id, target.tab.id));
      this.emit('fe-screen-changed', { ...this._current });
      // Persist only if a response already exists — a rule-driven advance
      // must not be the write that creates one (FR-L-8).
      if (this.responseId) {
        this.queueSave();
      }
    }
  }

  // ---- screens ------------------------------------------------------------

  private allScreens(): Screen[] {
    if (!this.norm) {
      return [];
    }
    const screens: Screen[] = [];
    for (const step of this.norm.steps) {
      for (const tab of step.tabs) {
        screens.push({ step, tab });
      }
    }
    return screens;
  }

  private visibleScreens(): Screen[] {
    const result = this._evalResult;
    if (!result) {
      return [];
    }
    return this.allScreens().filter(
      ({ step, tab }) =>
        result.visibleStepIds.has(step.id) &&
        result.visibleTabIds.has(tab.id) &&
        tab.questions.some((q) => result.visibleQuestionIds.has(q.id)),
    );
  }

  private currentScreen(): Screen | null {
    if (!this._current) {
      return null;
    }
    return (
      this.visibleScreens().find(
        (s) => s.step.id === this._current!.stepId && s.tab.id === this._current!.tabId,
      ) ?? null
    );
  }

  private currentIndex(): number {
    if (!this._current) {
      return -1;
    }
    return this.visibleScreens().findIndex(
      (s) => s.step.id === this._current!.stepId && s.tab.id === this._current!.tabId,
    );
  }

  // ---- answers -------------------------------------------------------------

  /**
   * FR2-9/FR2-10: a question whose type is unknown, or whose typeConfig does
   * not parse, renders a neutral placeholder and never participates in
   * answers or gating.
   */
  private isFallback(question: QuestionDef): boolean {
    const mod = getQuestionType(question.type);
    return mod === undefined || mod.validateConfig(question.typeConfig ?? {}).length > 0;
  }

  private handleAnswer(question: QuestionDef, value: AnswerValue | undefined): void {
    if (!question.code) {
      return;
    }
    if (value === undefined) {
      delete this.answers[question.code];
    } else {
      this.answers[question.code] = value;
    }
    if (this._invalidCodes.has(question.code) && value !== undefined) {
      const next = new Set(this._invalidCodes);
      next.delete(question.code);
      this._invalidCodes = next;
    }
    this.runRules();
    this.requestUpdate();
  }

  private handleFieldError(question: QuestionDef, message: string | null): void {
    if (!question.code) {
      return;
    }
    if (message === null && !this._fieldErrors.has(question.code)) {
      return;
    }
    const next = new Map(this._fieldErrors);
    if (message === null) {
      next.delete(question.code);
    } else {
      next.set(question.code, message);
    }
    this._fieldErrors = next;
  }

  // ---- uploads (Phase 3 §5.3, FR3-8/10/11/18) -----------------------------

  private adjustUploadBusy(code: string, delta: number): void {
    const next = new Map(this._uploadBusy);
    const count = (next.get(code) ?? 0) + delta;
    if (count > 0) {
      next.set(code, count);
    } else {
      next.delete(code);
    }
    this._uploadBusy = next;
  }

  /**
   * FR3-8 (amends FR-L-8): an upload needs a response to belong to, so the
   * response is created on first forward navigation OR first file upload,
   * whichever comes first — transparently, before the transfer starts.
   */
  private startFileUpload(
    question: QuestionDef,
    file: File,
    onProgress: (fraction: number) => void,
  ): UploadHandle {
    const code = question.code;
    this.adjustUploadBusy(code, 1);
    let aborted = false;
    let inner: UploadHandle | null = null;
    const promise = this.ensureResponse()
      .then((responseId) => {
        if (aborted) {
          throw new UploadAbortedError();
        }
        inner = this.client!.uploadFile(responseId, code, file, onProgress);
        return inner.promise;
      })
      .catch((err) => {
        if (!(err instanceof UploadAbortedError)) {
          this.emit('fe-error', {
            code: 'FILE_UPLOAD_FAILED',
            message: err instanceof Error ? err.message : 'File upload failed',
          });
        }
        throw err;
      })
      .finally(() => {
        this.adjustUploadBusy(code, -1);
      });
    return { promise, abort: () => { aborted = true; inner?.abort(); } };
  }

  /** Best-effort delete (FR3-10/11); the orphan cleanup job backstops failures. */
  private removeUploadedFile(fileId: string): void {
    if (this.responseId) {
      void this.client!.deleteFile(this.responseId, fileId).catch(() => {});
    }
  }

  private uploadsFor(question: QuestionDef): UploadContext {
    if (this.preview) {
      // FR4-7 (P4-D2): preview accepts selections in-memory only — client
      // pre-checks run, the row appears, gating is satisfied, nothing is
      // transmitted. The row carries a "preview — not uploaded" tag.
      return {
        preview: true,
        upload: (file, onProgress) => {
          onProgress(1);
          const ref: FileReference = {
            fileId: `preview-${++this.previewUploadCounter}`,
            fileName: file.name,
            size: file.size,
            contentType: file.type || 'application/octet-stream',
          };
          return { promise: Promise.resolve(ref), abort: () => {} };
        },
        remove: () => {},
      };
    }
    return {
      upload: (file, onProgress) => this.startFileUpload(question, file, onProgress),
      remove: (fileId) => this.removeUploadedFile(fileId),
    };
  }

  // ---- gating & navigation --------------------------------------------------

  /**
   * A question blocks forward navigation when (FR-L-5, Phase 2 §6.6,
   * Phase 3 FR3-18): required and unanswered; OR its stored answer fails
   * format validation (even when optional); OR it has unparseable pending
   * input; OR it has an in-flight upload (never submit a screen whose answer
   * is about to change). Fallback and display-block questions never block
   * (P2-D7, §6.9).
   */
  private offendingCodes(): string[] {
    const screen = this.currentScreen();
    const result = this._evalResult;
    if (!screen || !result) {
      return [];
    }
    return screen.tab.questions
      .filter((q) => {
        if (!q.code || !result.visibleQuestionCodes.has(q.code) || !isGateable(q)) {
          return false;
        }
        if ((this._uploadBusy.get(q.code) ?? 0) > 0) {
          return true;
        }
        if (this._fieldErrors.has(q.code)) {
          return true;
        }
        const mod = getQuestionType(q.type)!;
        const config = q.typeConfig ?? {};
        const value = this.answers[q.code];
        if (value !== undefined && mod.validateAnswer(value, config) !== null) {
          return true;
        }
        return result.requiredQuestionCodes.has(q.code) && !mod.isAnswered(value, config);
      })
      .map((q) => q.code);
  }

  private blockIfInvalid(): boolean {
    const offenders = this.offendingCodes();
    if (offenders.length === 0) {
      return false;
    }
    this._invalidCodes = new Set(offenders);
    this._announcement =
      offenders.length === 1
        ? this.msg('attentionOne')
        : this.msg('attentionMany', { n: offenders.length });
    void this.updateComplete.then(() => {
      const first = this.shadowRoot?.querySelector('.fe-invalid');
      (first as HTMLElement | null)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
    return true;
  }

  private navigateTo(screen: Screen, { forward }: { forward: boolean }): void {
    this._current = { stepId: screen.step.id, tabId: screen.tab.id };
    this.visited.add(screenKey(screen.step.id, screen.tab.id));
    this._invalidCodes = new Set();
    this._fieldErrors = new Map();
    this._announcement = '';
    this.emit('fe-screen-changed', { ...this._current });
    if (forward || this.responseId) {
      this.queueSave({ createIfMissing: forward });
    }
    this.requestUpdate();
  }

  private goNext(): void {
    if (this.blockIfInvalid()) {
      return;
    }
    const screens = this.visibleScreens();
    const idx = this.currentIndex();
    if (idx >= 0 && idx < screens.length - 1) {
      this.navigateTo(screens[idx + 1], { forward: true });
    }
  }

  private goBack(): void {
    const screens = this.visibleScreens();
    const idx = this.currentIndex();
    if (idx > 0) {
      this.navigateTo(screens[idx - 1], { forward: false });
    }
  }

  /** Free navigation to any previously visited screen (FR-L-5). */
  private goToVisited(screen: Screen): void {
    if (!this.visited.has(screenKey(screen.step.id, screen.tab.id))) {
      return;
    }
    this.navigateTo(screen, { forward: false });
  }

  private async finish(): Promise<void> {
    if (this._completing || this.blockIfInvalid()) {
      return;
    }
    // FR4-6: preview Finish renders the completion state locally — no save,
    // no complete call, no redirect.
    if (this.preview) {
      this._phase = 'completed';
      this.emit('fe-completed', { responseId: null, preview: true });
      return;
    }
    this._completing = true;
    try {
      this.queueSave({ createIfMissing: true });
      await this.drainPromise;
      // The final save may have hit the FR5-6 create-time 409, in which case
      // drainSaves already swapped to the already-submitted state.
      if ((this._phase as Phase) === 'already-submitted') {
        return;
      }
      if (this._saveFailed || !this.responseId) {
        throw new Error('final save failed');
      }
      await this.client!.completeResponse(this.responseId);
      this._phase = 'completed';
      // FR4-3: a completed session must not resume on the next refresh.
      this.clearSession();
      // FR4-18 / P4-D6: fe-completed first — host handlers always run — then
      // the redirect, if configured.
      this.emit('fe-completed', { responseId: this.responseId });
      this.maybeRedirect();
    } catch (err) {
      // FR5-6b: the complete-race loser — first completion won elsewhere.
      if (isAlreadySubmitted(err)) {
        this.handleAlreadySubmitted();
        return;
      }
      this._saveFailed = true;
      this.emitError('Completing the questionnaire failed', err);
    } finally {
      this._completing = false;
    }
  }

  /**
   * FR4-18: navigate the top window after completion. Only absolute http(s)
   * URLs; anything else (javascript:, data:, relative) is ignored with a
   * console warning — the scheme check is belt-and-suspenders, since the URL
   * comes from the embedding developer's own markup.
   */
  private maybeRedirect(): void {
    const raw = (this.completionRedirect ?? '').trim();
    if (!raw) {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      console.warn(`forms-engine: completion-redirect ignored — not an absolute URL: ${raw}`);
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn(`forms-engine: completion-redirect ignored — only http(s) URLs are allowed: ${raw}`);
      return;
    }
    this.redirectTo(parsed.href);
  }

  /** Separated so tests can intercept the actual navigation. */
  protected redirectTo(href: string): void {
    try {
      (window.top ?? window).location.assign(href);
    } catch {
      window.location.assign(href);
    }
  }

  // ---- persistence -----------------------------------------------------------

  private ensureResponse(): Promise<string> {
    if (this.responseId) {
      return Promise.resolve(this.responseId);
    }
    this.responseCreation ??= this.client!
      .createResponse(this.publicId, this.versionNumber, this.sessionRef ?? undefined)
      .then(({ responseId }) => {
        this.responseId = responseId;
        // FR4-1: the session becomes refresh-resilient the moment it exists.
        this.writeSession();
        return responseId;
      })
      .catch((err) => {
        this.responseCreation = null;
        throw err;
      });
    return this.responseCreation;
  }

  /**
   * FR5-11: a 409 ALREADY_SUBMITTED on create or complete swaps the form for
   * the already-submitted state — the complete-race loser sees it after
   * filling, which is unavoidable under last-line server enforcement; the
   * mount-time ref-status check exists precisely to make this rare. The stored
   * session is cleared: it can never complete.
   */
  private handleAlreadySubmitted(): void {
    this.clearSession();
    this._phase = 'already-submitted';
    this.emit('fe-already-submitted', { externalRef: this.sessionRef });
  }

  /**
   * Serialized, latest-wins save queue (FR-L-10/12). The answers map is
   * authoritative and full-replace (D-7), so superseded snapshots can be
   * dropped safely.
   */
  private queueSave(options: { createIfMissing: boolean } = { createIfMissing: false }): void {
    // FR4-6: preview mode never writes — no response, no PATCH, no storage.
    if (this.preview) {
      return;
    }
    if (!this._current || (!this.responseId && !options.createIfMissing)) {
      return;
    }
    this.pendingSave = { answers: { ...this.answers }, lastPosition: { ...this._current } };
    this.drainPromise ??= this.drainSaves().finally(() => {
      this.drainPromise = null;
    });
  }

  private async drainSaves(): Promise<void> {
    try {
      while (this.pendingSave) {
        const payload = this.pendingSave;
        this.pendingSave = null;
        const responseId = await this.ensureResponse();
        await this.client!.patchResponse(responseId, payload.answers, payload.lastPosition);
        this.writeSession();
        if (this._saveFailed) {
          this._saveFailed = false;
        }
      }
    } catch (err) {
      // FR5-11: create rejected because another session with this ref already
      // completed — swap to the terminal state instead of the saving banner.
      if (isAlreadySubmitted(err)) {
        this.pendingSave = null;
        this.handleAlreadySubmitted();
        return;
      }
      this._saveFailed = true;
      this.emitError('Saving answers failed', err);
    }
  }

  // ---- rendering ---------------------------------------------------------------

  override render(): TemplateResult {
    switch (this._phase) {
      case 'idle':
      case 'loading':
        return html`<div class="fe-root"><div class="fe-state" role="status">${this.msg('loading')}</div></div>`;
      case 'error':
        return html`<div class="fe-root">
          <div class="fe-state" role="alert">
            <h2>${this.msg('loadErrorTitle')}</h2>
            <p>${this.msg(this._errorKey)}</p>
          </div>
        </div>`;
      case 'completed':
        return html`<div class="fe-root">
          <div class="fe-state" role="status">
            <h2>${this.msg('completionTitle')}</h2>
            <p>${this.msg('completionMessage')}</p>
          </div>
        </div>`;
      case 'already-submitted':
        // FR5-11: rendered instead of the form (mount-time) or in place of the
        // completion state (409 race loser).
        return html`<div class="fe-root">
          <div class="fe-state" role="status">
            <p>${this.msg('alreadySubmittedMessage')}</p>
          </div>
        </div>`;
      case 'config-error':
        // FR5-5: a developer-facing integration failure, loud by design.
        return html`<div class="fe-root">
          <div class="fe-state" role="alert">
            <p>${this.msg('refMissingError')}</p>
          </div>
        </div>`;
      case 'ready':
        return this.renderReady();
    }
  }

  private renderReady(): TemplateResult {
    const screens = this.visibleScreens();
    const screen = this.currentScreen();
    if (!screen || screens.length === 0) {
      return html`<div class="fe-root">
        <div class="fe-state" role="status">${this.msg('emptyState')}</div>
      </div>`;
    }
    const idx = this.currentIndex();
    const isLast = idx === screens.length - 1;
    return html`
      <div class="fe-root">
        ${this._saveFailed
          ? html`<div class="fe-banner fe-banner-error" role="alert">${this.msg('savingError')}</div>`
          : nothing}
        ${this.renderStepper(screen)}
        <div class="fe-body">
          ${this.renderTabRail(screen)}
          <div class="fe-screen">
            ${this.renderSections(screen)}
            <div class="fe-nav">
              <span>
                ${idx > 0
                  ? html`<button class="fe-nav-button" type="button" @click=${() => this.goBack()}>
                      ${this.msg('back')}
                    </button>`
                  : nothing}
              </span>
              <span>
                ${isLast
                  ? html`<button
                      class="fe-nav-button fe-primary"
                      type="button"
                      ?disabled=${this._completing}
                      @click=${() => void this.finish()}
                    >
                      ${this._completing ? this.msg('finishing') : this.msg('finish')}
                    </button>`
                  : html`<button class="fe-nav-button fe-primary" type="button" @click=${() => this.goNext()}>
                      ${this.msg('next')}
                    </button>`}
              </span>
            </div>
          </div>
        </div>
        <p class="fe-visually-hidden" aria-live="polite">${this._announcement}</p>
      </div>
    `;
  }

  /** Horizontal stepper, only when the questionnaire has ≥ 2 real visible steps (FR-L-3). */
  private renderStepper(current: Screen): TemplateResult | typeof nothing {
    const result = this._evalResult!;
    const steps = this.norm!.steps.filter((s) => !s.synthetic && result.visibleStepIds.has(s.id));
    if (steps.length < 2) {
      return nothing;
    }
    const visible = this.visibleScreens();
    return html`
      <nav aria-label=${this.msg('stepsNavLabel')}>
        <ol class="fe-stepper">
          ${steps.map((step, i) => {
            // A step is clickable when one of its screens has been visited.
            const target = visible.find(
              (s) => s.step.id === step.id && this.visited.has(screenKey(s.step.id, s.tab.id)),
            );
            const isCurrent = step.id === current.step.id;
            const visitedStep = target !== undefined;
            return html`<li>
              <button
                class="fe-step-button ${visitedStep ? 'fe-visited' : ''}"
                type="button"
                aria-current=${isCurrent ? 'step' : nothing}
                ?disabled=${!visitedStep && !isCurrent}
                @click=${() => target && this.goToVisited(target)}
              >
                <span class="fe-step-index">${i + 1}</span>
                <span>${step.title}</span>
              </button>
            </li>`;
          })}
        </ol>
      </nav>
    `;
  }

  /** Left tab rail, only when the current step has ≥ 2 real visible tabs (FR-L-3). */
  private renderTabRail(current: Screen): TemplateResult | typeof nothing {
    const result = this._evalResult!;
    const tabs = current.step.tabs.filter(
      (t) =>
        !t.synthetic &&
        result.visibleTabIds.has(t.id) &&
        t.questions.some((q) => result.visibleQuestionIds.has(q.id)),
    );
    if (tabs.length < 2) {
      return nothing;
    }
    return html`
      <nav aria-label=${this.msg('tabsNavLabel')}>
        <ul class="fe-tab-rail">
          ${tabs.map((tab) => {
            const isCurrent = tab.id === current.tab.id;
            const visitedTab = this.visited.has(screenKey(current.step.id, tab.id));
            return html`<li>
              <button
                class="fe-tab-button"
                type="button"
                aria-current=${isCurrent ? 'true' : nothing}
                ?disabled=${!visitedTab && !isCurrent}
                @click=${() => this.goToVisited({ step: current.step, tab })}
              >
                ${tab.title}
              </button>
            </li>`;
          })}
        </ul>
      </nav>
    `;
  }

  private renderSections(screen: Screen): TemplateResult {
    const result = this._evalResult!;
    const visibleQuestions = screen.tab.questions.filter((q) =>
      result.visibleQuestionIds.has(q.id),
    );
    const sections = groupSections(visibleQuestions);
    return html`${sections.map(
      (section) => html`
        <section class="fe-section">
          ${section.title ? html`<h3 class="fe-section-title">${section.title}</h3>` : nothing}
          <div class="fe-section-grid">
            ${repeat(
              section.questions,
              (q) => q.id,
              (q) => this.renderQuestion(q),
            )}
          </div>
        </section>
      `,
    )}`;
  }

  private renderQuestion(question: QuestionDef): TemplateResult {
    const result = this._evalResult!;
    const renderer = getQuestionRenderer(question.type);
    const widthClass =
      question.width === 'HALF' ? 'fe-width-half' : question.width === 'FULL' ? 'fe-width-full' : '';
    if (!renderer || this.isFallback(question)) {
      // FR2-9/FR2-10: neutral placeholder, never a silent hole, never blocks.
      return html`<div class="fe-question ${widthClass}" data-code=${question.code || nothing}>
        <div class="fe-fallback" role="note">${this.msg('unknownTypePlaceholder')}</div>
      </div>`;
    }
    const code = question.code;
    const config = question.typeConfig ?? {};
    const value = code ? this.answers[code] : undefined;
    const mod = getQuestionType(question.type);
    const transient = code ? this._fieldErrors.get(code) : undefined;
    const formatError =
      mod && value !== undefined
        ? mod.validateAnswer(value, config, { messages: this.messages() })
        : null;
    const flagged = code ? this._invalidCodes.has(code) : false;
    const busy = code ? (this._uploadBusy.get(code) ?? 0) > 0 : false;
    const error =
      transient ??
      formatError ??
      (flagged ? (busy ? this.msg('uploadWaitToContinue') : this.msg('requiredError')) : null);
    const geocode = this.client ? (query: string, country?: string) => this.client!.geocode(query, country) : undefined;
    return html`<div class="fe-question ${widthClass}" data-code=${code || nothing}>
      ${renderer({
        question,
        value,
        required: code ? result.requiredQuestionCodes.has(code) : false,
        invalid: error !== null,
        error,
        disabled: false,
        onChange: (v) => this.handleAnswer(question, v),
        onFieldError: (message) => this.handleFieldError(question, message),
        geocode,
        uploads: this.uploadsFor(question),
        labels: this.messages(),
      })}
    </div>`;
  }
}

export function defineFormsEngine(): void {
  if (!customElements.get('forms-engine')) {
    customElements.define('forms-engine', FormsEngineElement);
  }
}
