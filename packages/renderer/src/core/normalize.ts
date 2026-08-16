/**
 * Normalization (BRD §5.1): every definition is reduced to the full
 * steps → tabs → questions container form by injecting synthetic steps/tabs
 * where a level was skipped. Synthetic containers render no chrome, always
 * pass visibility, and never cascade requirement. All navigation, gating and
 * persistence logic operates on the normalized model only.
 */
import type { Definition, QuestionDef, RuleConfig, StepDef, TabDef } from './types.js';

/** Deterministic ids so lastPosition stays stable across sessions. */
export const SYNTHETIC_STEP_ID = '__step__';
export function syntheticTabId(stepId: string): string {
  return `__tab__${stepId}`;
}

export interface NormalizedTab {
  id: string;
  title: string;
  synthetic: boolean;
  visibility: RuleConfig;
  requirement: RuleConfig;
  questions: QuestionDef[];
}

export interface NormalizedStep {
  id: string;
  title: string;
  synthetic: boolean;
  visibility: RuleConfig;
  requirement: RuleConfig;
  tabs: NormalizedTab[];
}

export interface NormalizedDefinition {
  steps: NormalizedStep[];
  /** All questions in reading order (step order, then tab order, then question order). */
  questions: QuestionDef[];
  questionsByCode: ReadonlyMap<string, QuestionDef>;
}

const ALWAYS: RuleConfig = { mode: 'ALWAYS' };
const NEVER: RuleConfig = { mode: 'NEVER' };

function syntheticTab(stepId: string, questions: QuestionDef[]): NormalizedTab {
  return {
    id: syntheticTabId(stepId),
    title: '',
    synthetic: true,
    visibility: ALWAYS,
    requirement: NEVER,
    questions,
  };
}

function realTab(tab: TabDef): NormalizedTab {
  return {
    id: tab.id,
    title: tab.title,
    synthetic: false,
    visibility: tab.visibility ?? ALWAYS,
    requirement: tab.requirement ?? NEVER,
    questions: tab.questions ?? [],
  };
}

function realStep(step: StepDef): NormalizedStep {
  const hasTabs = (step.tabs?.length ?? 0) > 0;
  return {
    id: step.id,
    title: step.title,
    synthetic: false,
    visibility: step.visibility ?? ALWAYS,
    requirement: step.requirement ?? NEVER,
    tabs: hasTabs
      ? step.tabs.map(realTab)
      : [syntheticTab(step.id, step.questions ?? [])],
  };
}

export function normalize(def: Definition): NormalizedDefinition {
  let steps: NormalizedStep[];
  if ((def.steps?.length ?? 0) > 0) {
    steps = def.steps.map(realStep);
  } else if ((def.tabs?.length ?? 0) > 0) {
    steps = [
      {
        id: SYNTHETIC_STEP_ID,
        title: '',
        synthetic: true,
        visibility: ALWAYS,
        requirement: NEVER,
        tabs: def.tabs.map(realTab),
      },
    ];
  } else {
    steps = [
      {
        id: SYNTHETIC_STEP_ID,
        title: '',
        synthetic: true,
        visibility: ALWAYS,
        requirement: NEVER,
        tabs: [syntheticTab(SYNTHETIC_STEP_ID, def.questions ?? [])],
      },
    ];
  }

  const questions: QuestionDef[] = [];
  for (const step of steps) {
    for (const tab of step.tabs) {
      questions.push(...tab.questions);
    }
  }
  const questionsByCode = new Map<string, QuestionDef>();
  for (const q of questions) {
    // DISPLAY_BLOCK entries have no code (§6.9) — they are never referenced.
    if (q.code) {
      questionsByCode.set(q.code, q);
    }
  }
  return { steps, questions, questionsByCode };
}

export interface Section {
  title: string;
  questions: QuestionDef[];
}

/**
 * Groups consecutive questions sharing the same sectionTitle into one titled
 * card (order-preserving; blank title → untitled card). BRD §5.1.
 */
export function groupSections(questions: QuestionDef[]): Section[] {
  const sections: Section[] = [];
  for (const q of questions) {
    const title = q.sectionTitle ?? '';
    const last = sections[sections.length - 1];
    if (last && last.title === title) {
      last.questions.push(q);
    } else {
      sections.push({ title, questions: [q] });
    }
  }
  return sections;
}
