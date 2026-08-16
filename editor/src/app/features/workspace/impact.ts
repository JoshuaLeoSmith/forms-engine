/**
 * Rule-impact analysis for question-code rename/delete and container deletes
 * (FR-E-6, FR-E-13, FR-E-14, decisions D-2/D-2b). Pure functions over the
 * definition; mutating helpers expect to be handed a clone.
 */
import { addressEnabledFields, getQuestionType } from '@forms-engine/renderer/core';
import type { Condition, Definition, QuestionDef, RuleConfig, StepDef, TabDef } from '../../core/models';

export type RuleAspect = 'visibility' | 'requirement';

export interface RuleRef {
  ownerType: 'STEP' | 'TAB' | 'QUESTION';
  ownerId: string;
  /** e.g. "question `colorFav` (Step 2 › Tab 1)" */
  ownerLabel: string;
  aspect: RuleAspect;
  /** Conditions in the rule referencing the code under analysis. */
  matchingConditions: number;
  /** All conditions in the rule. */
  totalConditions: number;
  /** True when removing the matching conditions would empty the rule (fail-open, D-2b). */
  failsOpen: boolean;
}

interface RuleSite {
  ownerType: RuleRef['ownerType'];
  ownerId: string;
  ownerLabel: string;
  aspect: RuleAspect;
  config: RuleConfig;
  /** The owning element, needed to apply fail-open. */
  owner: StepDef | TabDef | QuestionDef;
}

function label(prefix: string, title: string, index: number): string {
  return title?.trim() ? `${prefix} “${title}”` : `${prefix} ${index + 1}`;
}

/** Every rule site in the definition with a human-readable location label. */
export function collectRuleSites(def: Definition): RuleSite[] {
  const sites: RuleSite[] = [];
  const push = (
    owner: StepDef | TabDef | QuestionDef,
    ownerType: RuleRef['ownerType'],
    ownerLabel: string,
  ) => {
    sites.push({ ownerType, ownerId: owner.id, ownerLabel, aspect: 'visibility', config: owner.visibility, owner });
    sites.push({ ownerType, ownerId: owner.id, ownerLabel, aspect: 'requirement', config: owner.requirement, owner });
  };
  const pushQuestions = (questions: QuestionDef[], location: string) => {
    for (const q of questions) {
      push(q, 'QUESTION', `question \`${q.code}\`${location ? ` (${location})` : ''}`);
    }
  };
  def.steps.forEach((step, si) => {
    const stepLabel = label('Step', step.title, si);
    push(step, 'STEP', stepLabel.toLowerCase());
    step.tabs.forEach((tab, ti) => {
      const tabLabel = `${stepLabel} › ${label('Tab', tab.title, ti)}`;
      push(tab, 'TAB', tabLabel.toLowerCase());
      pushQuestions(tab.questions, tabLabel);
    });
    pushQuestions(step.questions, stepLabel);
  });
  def.tabs.forEach((tab, ti) => {
    const tabLabel = label('Tab', tab.title, ti);
    push(tab, 'TAB', tabLabel.toLowerCase());
    pushQuestions(tab.questions, tabLabel);
  });
  pushQuestions(def.questions, '');
  return sites;
}

function matches(condition: Condition, code: string): boolean {
  return condition.source === 'QUESTION' && condition.questionCode === code;
}

/** All rules whose conditions reference `code` (excluding elements in `excludeIds`). */
export function findRuleRefs(def: Definition, code: string, excludeIds: ReadonlySet<string> = new Set()): RuleRef[] {
  const refs: RuleRef[] = [];
  for (const site of collectRuleSites(def)) {
    if (excludeIds.has(site.ownerId)) {
      continue;
    }
    const conditions = site.config.rule?.conditions ?? [];
    const matching = conditions.filter((c) => matches(c, code)).length;
    if (site.config.mode === 'CONDITIONAL' && matching > 0) {
      refs.push({
        ownerType: site.ownerType,
        ownerId: site.ownerId,
        ownerLabel: site.ownerLabel,
        aspect: site.aspect,
        matchingConditions: matching,
        totalConditions: conditions.length,
        failsOpen: matching === conditions.length,
      });
    }
  }
  return refs;
}

/** FR-E-13 / D-2: rename atomically updates every referencing condition. */
export function applyCodeRename(def: Definition, oldCode: string, newCode: string): void {
  for (const site of collectRuleSites(def)) {
    for (const condition of site.config.rule?.conditions ?? []) {
      if (matches(condition, oldCode)) {
        condition.questionCode = newCode;
      }
    }
  }
}

/**
 * Removes every condition matching `predicate`; a rule left with zero
 * conditions fails open (D-2b) — visibility→ALWAYS, requirement→ALWAYS for
 * questions / NEVER for containers. Elements in `excludeIds` are skipped.
 */
export function removeConditionsWhere(
  def: Definition,
  predicate: (condition: Condition) => boolean,
  excludeIds: ReadonlySet<string> = new Set(),
): void {
  for (const site of collectRuleSites(def)) {
    if (excludeIds.has(site.ownerId) || site.config.mode !== 'CONDITIONAL' || !site.config.rule) {
      continue;
    }
    const before = site.config.rule.conditions.length;
    site.config.rule.conditions = site.config.rule.conditions.filter((c) => !predicate(c));
    if (before > 0 && site.config.rule.conditions.length === 0) {
      if (site.aspect === 'visibility') {
        site.owner.visibility = { mode: 'ALWAYS' };
      } else {
        site.owner.requirement = { mode: site.ownerType === 'QUESTION' ? 'ALWAYS' : 'NEVER' };
      }
    }
  }
}

/**
 * FR-E-14 / D-2b: removes every condition referencing any of `codes`; rules
 * left empty fail open. Elements in `excludeIds` (about to be deleted) are
 * skipped.
 */
export function applyConditionRemoval(
  def: Definition,
  codes: ReadonlySet<string>,
  excludeIds: ReadonlySet<string> = new Set(),
): void {
  removeConditionsWhere(def, (c) => c.source === 'QUESTION' && codes.has(c.questionCode), excludeIds);
}

/**
 * The stored answer-value shape per type — used to decide when a type change
 * needs the FR2-15 impact modal (historical responses keep old-shaped values).
 */
export function answerShape(
  type: string,
): 'string' | 'number' | 'boolean' | 'array' | 'object' | 'files' | 'none' {
  const mod = getQuestionType(type);
  if (!mod || !mod.answerable) {
    return 'none';
  }
  switch (mod.conditionValueKind) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'address':
      return 'object';
    case 'none':
      // Answerable but never referenceable: FILE_UPLOAD's file-reference
      // arrays (Phase 3 §4.2) — a distinct shape from CHECKBOX's string array.
      return 'files';
    default:
      return type === 'CHECKBOX' ? 'array' : 'string';
  }
}

/**
 * FR2-15: whether an existing condition referencing `code` becomes invalid
 * when the question changes to `updated`'s type/config (per the §4.2 matrix):
 * disallowed operator, subField on a non-ADDRESS, missing/disabled subField
 * on an ADDRESS, mismatched value type, or an unanswerable target.
 */
export function conditionIncompatibleWith(condition: Condition, code: string, updated: QuestionDef): boolean {
  if (!matches(condition, code)) {
    return false;
  }
  const mod = getQuestionType(updated.type);
  if (!mod || !mod.answerable) {
    return true;
  }
  if (!mod.allowedOperators.includes(condition.operator)) {
    return true;
  }
  if (updated.type === 'ADDRESS') {
    if (!condition.subField || !addressEnabledFields(updated.typeConfig).includes(condition.subField as never)) {
      return true;
    }
  } else if (condition.subField !== undefined) {
    return true;
  }
  const expected =
    mod.conditionValueKind === 'number' ? 'number' : mod.conditionValueKind === 'boolean' ? 'boolean' : 'string';
  return typeof condition.value !== expected;
}

/** FR2-15: rules holding conditions that the type change would invalidate. */
export function findIncompatibleRefs(def: Definition, code: string, updated: QuestionDef): RuleRef[] {
  const refs: RuleRef[] = [];
  for (const site of collectRuleSites(def)) {
    if (site.ownerId === updated.id || site.config.mode !== 'CONDITIONAL') {
      continue;
    }
    const conditions = site.config.rule?.conditions ?? [];
    const matching = conditions.filter((c) => conditionIncompatibleWith(c, code, updated)).length;
    if (matching > 0) {
      refs.push({
        ownerType: site.ownerType,
        ownerId: site.ownerId,
        ownerLabel: site.ownerLabel,
        aspect: site.aspect,
        matchingConditions: matching,
        totalConditions: conditions.length,
        failsOpen: matching === conditions.length,
      });
    }
  }
  return refs;
}

/** Question codes contained in a step/tab subtree (for FR-E-6 delete warnings). */
export function containedCodes(element: StepDef | TabDef): string[] {
  const codes: string[] = [];
  const fromQuestions = (questions: QuestionDef[]) => questions.forEach((q) => codes.push(q.code));
  if ('tabs' in element) {
    element.tabs.forEach((tab) => fromQuestions(tab.questions));
    fromQuestions(element.questions);
  } else {
    fromQuestions(element.questions);
  }
  return codes;
}

/** Element ids of a step/tab subtree (owner, nested tabs, questions). */
export function subtreeIds(element: StepDef | TabDef): Set<string> {
  const ids = new Set<string>([element.id]);
  if ('tabs' in element) {
    for (const tab of element.tabs) {
      ids.add(tab.id);
      tab.questions.forEach((q) => ids.add(q.id));
    }
  }
  element.questions.forEach((q) => ids.add(q.id));
  return ids;
}

export interface ContentSummary {
  tabs: number;
  questions: number;
}

export function summarizeContents(element: StepDef | TabDef): ContentSummary {
  if ('tabs' in element) {
    return {
      tabs: element.tabs.length,
      questions: element.tabs.reduce((n, t) => n + t.questions.length, 0) + element.questions.length,
    };
  }
  return { tabs: 0, questions: element.questions.length };
}
