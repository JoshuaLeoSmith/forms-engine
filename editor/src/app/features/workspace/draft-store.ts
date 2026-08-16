import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService, apiErrors } from '../../core/api.service';
import { newId } from '../../core/ids';
import {
  emptyDefinition,
  normalize,
  SCHEMA_VERSION,
  SYNTHETIC_STEP_ID,
  syntheticTabId,
  type Definition,
  type NormalizedStep,
  type NormalizedTab,
  type QuestionDef,
  type QuestionnaireDetail,
  type StepDef,
  type TabDef,
} from '../../core/models';
import {
  applyCodeRename,
  applyConditionRemoval,
  conditionIncompatibleWith,
  containedCodes,
  removeConditionsWhere,
} from './impact';

export interface ScreenSelection {
  stepId: string;
  tabId: string;
}

export interface Capability {
  ok: boolean;
  reason?: string;
}

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Workspace draft state: the working definition, autosave (FR-E-15 — 2s idle
 * debounce, immediate flush on modal close/navigation), the current screen
 * selection, and every structure operation (FR-E-4). One instance per open
 * workspace (provided by WorkspacePage).
 */
@Injectable()
export class DraftStore {
  private readonly api = inject(ApiService);

  readonly detail = signal<QuestionnaireDetail | null>(null);
  readonly draft = signal<Definition | null>(null);
  readonly saveState = signal<'idle' | 'pending' | 'saving' | 'error'>('idle');
  readonly saveErrors = signal<string[]>([]);
  readonly selection = signal<ScreenSelection | null>(null);

  readonly norm = computed(() => {
    const draft = this.draft();
    return draft ? normalize(draft) : null;
  });

  /** The selected normalized screen, falling back to the first one. */
  readonly currentScreen = computed<{ step: NormalizedStep; tab: NormalizedTab } | null>(() => {
    const norm = this.norm();
    if (!norm || norm.steps.length === 0) {
      return null;
    }
    const sel = this.selection();
    for (const step of norm.steps) {
      for (const tab of step.tabs) {
        if (sel && step.id === sel.stepId && tab.id === sel.tabId) {
          return { step, tab };
        }
      }
    }
    const step = norm.steps[0];
    return { step, tab: step.tabs[0] };
  });

  /** Every referenceable code — codeless entries (DISPLAY_BLOCK) excluded. */
  readonly allCodes = computed<string[]>(
    () => this.norm()?.questions.map((q) => q.code).filter(Boolean) ?? [],
  );

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savingPromise: Promise<void> | null = null;
  private dirty = false;

  async load(id: string): Promise<void> {
    const detail = await this.api.get(id);
    this.detail.set(detail);
    this.draft.set(detail.draft ?? emptyDefinition());
    this.selection.set(null);
    this.dirty = false;
    this.saveState.set('idle');
  }

  // ---- editing & autosave --------------------------------------------------

  /** Clone-mutate-set; every edit funnels through here and schedules autosave. */
  update(mutator: (draft: Definition) => void): void {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    const next = structuredClone(draft);
    mutator(next);
    // FR2-2: any edit upgrades a v1 draft to the current schema version — a
    // pure version-field bump, no structural rewrite.
    next.schemaVersion = SCHEMA_VERSION;
    this.draft.set(next);
    this.dirty = true;
    this.saveState.set('pending');
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.flush(), AUTOSAVE_DEBOUNCE_MS);
  }

  /** Immediate save — called on modal close, navigation, and page exit (FR-E-15). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.savingPromise) {
      await this.savingPromise;
    }
    if (!this.dirty) {
      return;
    }
    const detail = this.detail();
    const draft = this.draft();
    if (!detail || !draft) {
      return;
    }
    this.dirty = false;
    this.saveState.set('saving');
    this.savingPromise = this.api
      .saveDraft(detail.id, draft)
      .then((updated) => {
        // Keep local draft (it may already have newer edits); adopt metadata.
        this.detail.set({ ...updated, draft: this.draft() ?? updated.draft });
        if (!this.dirty) {
          this.saveState.set('idle');
        }
        this.saveErrors.set([]);
      })
      .catch((err) => {
        this.dirty = true;
        this.saveState.set('error');
        this.saveErrors.set(apiErrors(err));
      })
      .finally(() => {
        this.savingPromise = null;
      });
    await this.savingPromise;
  }

  /** Adopt a server-produced detail (publish/restore) as the new local state. */
  adopt(detail: QuestionnaireDetail): void {
    this.detail.set(detail);
    this.draft.set(detail.draft);
    this.dirty = false;
    this.saveState.set('idle');
    this.saveErrors.set([]);
  }

  // ---- capabilities (FR-E-4: contextual enforcement with explanations) ----

  canAddStep(): Capability {
    const d = this.draft();
    if (!d) {
      return { ok: false };
    }
    if (d.tabs.length > 0) {
      return { ok: false, reason: 'This questionnaire uses top-level tabs. Remove them to use steps.' };
    }
    if (d.questions.length > 0) {
      return { ok: false, reason: 'This questionnaire has direct questions. Move or remove them to use steps.' };
    }
    return { ok: true };
  }

  canAddTopLevelTab(): Capability {
    const d = this.draft();
    if (!d) {
      return { ok: false };
    }
    if (d.steps.length > 0) {
      return { ok: false, reason: 'This questionnaire uses steps. Add tabs inside a step instead.' };
    }
    if (d.questions.length > 0) {
      return { ok: false, reason: 'This questionnaire has direct questions. Move or remove them to use tabs.' };
    }
    return { ok: true };
  }

  canAddTabToStep(stepId: string): Capability {
    const step = this.draft()?.steps.find((s) => s.id === stepId);
    if (!step) {
      return { ok: false };
    }
    if (step.questions.length > 0) {
      return {
        ok: false,
        reason: 'This step has direct questions. Move or remove them before adding tabs.',
      };
    }
    return { ok: true };
  }

  // ---- structure ops -------------------------------------------------------

  addStep(title: string): void {
    const id = newId();
    this.update((d) => {
      d.steps.push({
        id,
        title,
        visibility: { mode: 'ALWAYS' },
        requirement: { mode: 'NEVER' },
        tabs: [],
        questions: [],
      });
    });
    this.selection.set({ stepId: id, tabId: syntheticTabId(id) });
  }

  addTab(stepId: string | null, title: string): void {
    const id = newId();
    const tab: TabDef = {
      id,
      title,
      visibility: { mode: 'ALWAYS' },
      requirement: { mode: 'NEVER' },
      questions: [],
    };
    this.update((d) => {
      if (stepId) {
        d.steps.find((s) => s.id === stepId)?.tabs.push(tab);
      } else {
        d.tabs.push(tab);
      }
    });
    this.selection.set({ stepId: stepId ?? SYNTHETIC_STEP_ID, tabId: id });
  }

  renameStep(stepId: string, title: string): void {
    this.update((d) => {
      const step = d.steps.find((s) => s.id === stepId);
      if (step) {
        step.title = title;
      }
    });
  }

  renameTab(stepId: string | null, tabId: string, title: string): void {
    this.update((d) => {
      const tabs = stepId ? (d.steps.find((s) => s.id === stepId)?.tabs ?? []) : d.tabs;
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        tab.title = title;
      }
    });
  }

  moveStep(stepId: string, direction: -1 | 1): void {
    this.update((d) => moveById(d.steps, stepId, direction));
  }

  moveTab(stepId: string | null, tabId: string, direction: -1 | 1): void {
    this.update((d) => {
      const tabs = stepId ? (d.steps.find((s) => s.id === stepId)?.tabs ?? []) : d.tabs;
      moveById(tabs, tabId, direction);
    });
  }

  /** FR-E-6 + FR-E-14: delete a step, removing outside references to its codes. */
  deleteStep(stepId: string): void {
    this.update((d) => {
      const step = d.steps.find((s) => s.id === stepId);
      if (!step) {
        return;
      }
      const codes = new Set(containedCodes(step));
      const removedIds = collectSubtreeIds(step);
      d.steps = d.steps.filter((s) => s.id !== stepId);
      applyConditionRemoval(d, codes, removedIds);
    });
    this.selection.set(null);
  }

  deleteTab(stepId: string | null, tabId: string): void {
    this.update((d) => {
      const owner = stepId ? d.steps.find((s) => s.id === stepId) : null;
      const tabs = owner ? owner.tabs : d.tabs;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) {
        return;
      }
      const codes = new Set(containedCodes(tab));
      const removedIds = new Set<string>([tab.id, ...tab.questions.map((q) => q.id)]);
      const filtered = tabs.filter((t) => t.id !== tabId);
      if (owner) {
        owner.tabs = filtered;
      } else {
        d.tabs = filtered;
      }
      applyConditionRemoval(d, codes, removedIds);
    });
    this.selection.set(null);
  }

  // ---- question ops --------------------------------------------------------

  /** Container (questions array) for the currently selected screen. */
  private questionsOf(d: Definition, sel: ScreenSelection): QuestionDef[] | null {
    if (sel.stepId === SYNTHETIC_STEP_ID) {
      if (sel.tabId === syntheticTabId(SYNTHETIC_STEP_ID)) {
        return d.questions;
      }
      return d.tabs.find((t) => t.id === sel.tabId)?.questions ?? null;
    }
    const step = d.steps.find((s) => s.id === sel.stepId);
    if (!step) {
      return null;
    }
    if (sel.tabId === syntheticTabId(step.id)) {
      return step.questions;
    }
    return step.tabs.find((t) => t.id === sel.tabId)?.questions ?? null;
  }

  /** Where a new question would land given the current selection. */
  currentQuestionTarget(): ScreenSelection {
    const screen = this.currentScreen();
    if (screen) {
      return { stepId: screen.step.id, tabId: screen.tab.id };
    }
    return { stepId: SYNTHETIC_STEP_ID, tabId: syntheticTabId(SYNTHETIC_STEP_ID) };
  }

  canAddQuestionHere(): Capability {
    const d = this.draft();
    if (!d) {
      return { ok: false };
    }
    if (d.steps.length === 0 && d.tabs.length === 0) {
      return { ok: true }; // questions-only questionnaire (possibly empty)
    }
    const screen = this.currentScreen();
    if (!screen) {
      return { ok: false, reason: 'Select a screen first.' };
    }
    if (!screen.tab.synthetic || screen.step.tabs.length === 1) {
      return { ok: true };
    }
    return { ok: false };
  }

  /**
   * Adds a question to the current screen. If a section with the same title
   * already exists there, the question joins the end of that section's last
   * group instead of starting a duplicate card at the bottom — sections are
   * derived from consecutive titles (§5.1), so a plain append would split
   * them. Deliberate splits remain possible via move up/down.
   */
  addQuestion(question: QuestionDef): void {
    const sel = this.currentQuestionTarget();
    this.update((d) => {
      const questions = this.questionsOf(d, sel);
      if (!questions) {
        return;
      }
      const title = question.sectionTitle ?? '';
      let insertAt = questions.length;
      for (let i = questions.length - 1; i >= 0; i--) {
        if ((questions[i].sectionTitle ?? '') === title) {
          insertAt = i + 1;
          break;
        }
      }
      questions.splice(insertAt, 0, question);
    });
  }

  updateQuestion(updated: QuestionDef, oldCode: string, oldType?: string): void {
    this.update((d) => {
      const q = findQuestionById(d, updated.id);
      if (!q) {
        return;
      }
      Object.assign(q, structuredClone(updated));
      if (oldCode && updated.code && oldCode !== updated.code) {
        // FR-E-13 / D-2: rename updates every referencing condition atomically.
        applyCodeRename(d, oldCode, updated.code);
      }
      if (oldType !== undefined && oldType !== updated.type) {
        // FR2-15: conditions the type change invalidates (per the §4.2
        // matrix) are removed, with FR-E-14 fail-open behavior.
        const refCode = updated.code || oldCode;
        removeConditionsWhere(
          d,
          (c) => conditionIncompatibleWith(c, refCode, updated),
          new Set([updated.id]),
        );
      }
    });
  }

  /** FR-E-14 / D-2b: delete question, remove referencing conditions, fail open. */
  deleteQuestion(questionId: string): void {
    this.update((d) => {
      const q = findQuestionById(d, questionId);
      if (!q) {
        return;
      }
      const code = q.code;
      removeQuestionById(d, questionId);
      applyConditionRemoval(d, new Set([code]), new Set([questionId]));
    });
  }

  moveQuestion(questionId: string, direction: -1 | 1): void {
    const sel = this.currentQuestionTarget();
    this.update((d) => {
      const questions = this.questionsOf(d, sel);
      if (questions) {
        moveById(questions, questionId, direction);
      }
    });
  }
}

function moveById<T extends { id: string }>(items: T[], id: string, direction: -1 | 1): void {
  const index = items.findIndex((i) => i.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) {
    return;
  }
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item);
}

function collectSubtreeIds(step: StepDef): Set<string> {
  const ids = new Set<string>([step.id]);
  for (const tab of step.tabs) {
    ids.add(tab.id);
    tab.questions.forEach((q) => ids.add(q.id));
  }
  step.questions.forEach((q) => ids.add(q.id));
  return ids;
}

function* allQuestionArrays(d: Definition): Generator<QuestionDef[]> {
  for (const step of d.steps) {
    for (const tab of step.tabs) {
      yield tab.questions;
    }
    yield step.questions;
  }
  for (const tab of d.tabs) {
    yield tab.questions;
  }
  yield d.questions;
}

function findQuestionById(d: Definition, id: string): QuestionDef | null {
  for (const questions of allQuestionArrays(d)) {
    const q = questions.find((x) => x.id === id);
    if (q) {
      return q;
    }
  }
  return null;
}

function removeQuestionById(d: Definition, id: string): void {
  for (const questions of allQuestionArrays(d)) {
    const index = questions.findIndex((x) => x.id === id);
    if (index >= 0) {
      questions.splice(index, 1);
      return;
    }
  }
}
