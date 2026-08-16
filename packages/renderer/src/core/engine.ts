/**
 * Rule engine (Phase 1 §6, Phase 2 §4). Pure functions over the normalized
 * definition and the flat typed answers map. Semantics are pinned by the
 * shared conformance fixtures in shared/rule-fixtures — a future Java port
 * must pass the same files (§6.6).
 */
import type { NormalizedDefinition } from './normalize.js';
import type { AnswersMap, AnswerValue, Condition, ConditionValue, RuleConfig } from './types.js';
import { getQuestionType, isAnswered } from './registry.js';
import { isValidIsoDate } from './dates.js';
import type { QuestionDef } from './types.js';

/** Safety cap for the clearing fixpoint loop (§6.7). */
export const FIXPOINT_CAP = 25;

export interface EvaluationResult {
  /** Answers after rule-driven clearing — a new object, input is not mutated. */
  answers: AnswersMap;
  visibleStepIds: ReadonlySet<string>;
  visibleTabIds: ReadonlySet<string>;
  /** Effectively-visible questions by id — includes codeless DISPLAY_BLOCKs. */
  visibleQuestionIds: ReadonlySet<string>;
  visibleQuestionCodes: ReadonlySet<string>;
  /** Effectively-required codes; always a subset of visibleQuestionCodes (§6.4). */
  requiredQuestionCodes: ReadonlySet<string>;
  /** Codes whose answers were cleared by the fixpoint loop, in clearing order. */
  clearedCodes: string[];
  /** True if the iteration cap was hit (log + proceed, never crash — §6.7). */
  capHit: boolean;
}

const isPlainObject = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Strict typed equality for EQUALS/NOT_EQUALS (§4.3): numeric equality for
 * numbers, boolean equality for toggles, exact case-sensitive comparison for
 * strings. Cross-type comparisons are never equal (the validator prevents
 * them; the engine just stays conservative).
 */
function typedEquals(answer: string | number | boolean, value: ConditionValue): boolean {
  return answer === value;
}

/**
 * Condition truth table (Phase 1 §6.3, Phase 2 §4.3): NO operator evaluates
 * true against an unanswered question. Unknown sources and unknown operators
 * are conservative-false so future additions cannot accidentally fire.
 */
export function evaluateCondition(condition: Condition, answers: AnswersMap): boolean {
  if (condition.source !== 'QUESTION') {
    return false;
  }
  const stored: AnswerValue | undefined = answers[condition.questionCode];
  if (stored === undefined) {
    return false;
  }

  // Address sub-field targeting (FR2-6, P2-D3): compare the sub-field string;
  // an empty-string sub-field counts as unanswered for this condition.
  let answer: string | number | boolean | string[];
  if (condition.subField !== undefined && condition.subField !== '') {
    if (!isPlainObject(stored)) {
      return false;
    }
    const sub = stored[condition.subField];
    if (typeof sub !== 'string' || sub === '') {
      return false;
    }
    answer = sub;
  } else if (isPlainObject(stored)) {
    // Whole-object comparison is meaningless (FR2-6) — validation rejects it;
    // the engine stays conservative.
    return false;
  } else if (Array.isArray(stored)) {
    // File-reference arrays (Phase 3, P3-D6) are never referenceable —
    // conservative-false, like whole-object ADDRESS comparison.
    if (!stored.every((el): el is string => typeof el === 'string')) {
      return false;
    }
    answer = stored;
  } else {
    answer = stored;
  }

  // Emptiness = unanswered (empty strings/arrays are never stored, FR2-4;
  // belt and braces for hand-written fixtures and foreign data).
  if (typeof answer === 'string' && answer === '') {
    return false;
  }
  if (Array.isArray(answer) && answer.length === 0) {
    return false;
  }

  const value = condition.value;
  switch (condition.operator) {
    case 'EQUALS':
      return !Array.isArray(answer) && typedEquals(answer, value);
    case 'NOT_EQUALS':
      return !Array.isArray(answer) && !typedEquals(answer, value);
    case 'CONTAINS':
      return Array.isArray(answer) && typeof value === 'string' && answer.includes(value);
    case 'NOT_CONTAINS':
      // Conservative: false when unanswered (handled above), mirrors NOT_EQUALS.
      return Array.isArray(answer) && typeof value === 'string' && !answer.includes(value);
    case 'GREATER_THAN':
      return typeof answer === 'number' && typeof value === 'number' && answer > value;
    case 'LESS_THAN':
      return typeof answer === 'number' && typeof value === 'number' && answer < value;
    case 'BEFORE':
      // ISO YYYY-MM-DD compares correctly lexicographically (§4.3) — string
      // comparison after format validation, no Date objects, no timezones.
      return isValidIsoDate(answer) && isValidIsoDate(value) && answer < value;
    case 'AFTER':
      return isValidIsoDate(answer) && isValidIsoDate(value) && answer > value;
    default:
      return false;
  }
}

/**
 * Evaluates a visibility/requirement config. CONDITIONAL with zero conditions
 * is NEVER in disguise (§6.2 — the editor warns about it but it is legal).
 */
export function evaluateRuleConfig(config: RuleConfig | undefined, answers: AnswersMap): boolean {
  if (!config) {
    return false;
  }
  switch (config.mode) {
    case 'ALWAYS':
      return true;
    case 'NEVER':
      return false;
    case 'CONDITIONAL': {
      const conditions = config.rule?.conditions ?? [];
      if (conditions.length === 0) {
        return false;
      }
      return config.rule!.combinator === 'ANY'
        ? conditions.some((c) => evaluateCondition(c, answers))
        : conditions.every((c) => evaluateCondition(c, answers));
    }
    default:
      return false;
  }
}

/**
 * A question participates in answers/required gating only when its type is
 * registered, answerable, and its typeConfig parses (FR2-9/FR2-10, §6.9).
 * Unknown or broken types must never block navigation (P2-D7). Cached per
 * QuestionDef — definitions are immutable within a session.
 */
const gateableCache = new WeakMap<QuestionDef, boolean>();

export function isGateable(question: QuestionDef): boolean {
  const cached = gateableCache.get(question);
  if (cached !== undefined) {
    return cached;
  }
  const mod = getQuestionType(question.type);
  const result =
    mod !== undefined &&
    mod.answerable &&
    mod.validateConfig(question.typeConfig ?? {}).length === 0;
  gateableCache.set(question, result);
  return result;
}

interface VisibilityPass {
  stepIds: Set<string>;
  tabIds: Set<string>;
  questionIds: Set<string>;
  questionCodes: Set<string>;
}

function computeVisibility(norm: NormalizedDefinition, answers: AnswersMap): VisibilityPass {
  const stepIds = new Set<string>();
  const tabIds = new Set<string>();
  const questionIds = new Set<string>();
  const questionCodes = new Set<string>();
  for (const step of norm.steps) {
    const stepVisible = step.synthetic || evaluateRuleConfig(step.visibility, answers);
    if (!stepVisible) {
      continue;
    }
    stepIds.add(step.id);
    for (const tab of step.tabs) {
      const tabVisible = tab.synthetic || evaluateRuleConfig(tab.visibility, answers);
      if (!tabVisible) {
        continue;
      }
      tabIds.add(tab.id);
      for (const q of tab.questions) {
        if (evaluateRuleConfig(q.visibility, answers)) {
          questionIds.add(q.id);
          if (q.code) {
            questionCodes.add(q.code);
          }
        }
      }
    }
  }
  return { stepIds, tabIds, questionIds, questionCodes };
}

/**
 * Full evaluation (§6.7): run visibility + clearing to a fixpoint, then
 * compute effective requirement from the settled answers. Deterministic and
 * monotone (answers are only removed within the loop), so it terminates well
 * under the cap; the cap is a safety net.
 */
export function evaluate(norm: NormalizedDefinition, answersIn: AnswersMap): EvaluationResult {
  const answers: AnswersMap = { ...answersIn };
  const clearedCodes: string[] = [];
  let capHit = false;

  let pass = computeVisibility(norm, answers);
  let stable = false;
  for (let i = 0; i < FIXPOINT_CAP; i++) {
    pass = computeVisibility(norm, answers);
    const toClear = norm.questions.filter(
      (q) => q.code && answers[q.code] !== undefined && !pass.questionCodes.has(q.code),
    );
    if (toClear.length === 0) {
      stable = true;
      break;
    }
    for (const q of toClear) {
      delete answers[q.code];
      clearedCodes.push(q.code);
    }
  }
  if (!stable) {
    capHit = true;
    // Proceed with the current state (§6.7) — recompute so the reported
    // visibility reflects the answers as they now stand.
    pass = computeVisibility(norm, answers);
  }

  // Effective requirement (§6.4): OR of own requirement and the tab/step
  // cascades; a question that is not effectively visible is never required.
  // Non-gateable questions (display blocks, unknown types, broken configs)
  // are never required (§6.9, FR2-9, P2-D7).
  const requiredQuestionCodes = new Set<string>();
  for (const step of norm.steps) {
    if (!pass.stepIds.has(step.id)) {
      continue;
    }
    const stepCascade = !step.synthetic && evaluateRuleConfig(step.requirement, answers);
    for (const tab of step.tabs) {
      if (!pass.tabIds.has(tab.id)) {
        continue;
      }
      const tabCascade = !tab.synthetic && evaluateRuleConfig(tab.requirement, answers);
      for (const q of tab.questions) {
        if (!q.code || !pass.questionCodes.has(q.code) || !isGateable(q)) {
          continue;
        }
        if (stepCascade || tabCascade || evaluateRuleConfig(q.requirement, answers)) {
          requiredQuestionCodes.add(q.code);
        }
      }
    }
  }

  return {
    answers,
    visibleStepIds: pass.stepIds,
    visibleTabIds: pass.tabIds,
    visibleQuestionIds: pass.questionIds,
    visibleQuestionCodes: pass.questionCodes,
    requiredQuestionCodes,
    clearedCodes,
    capHit,
  };
}

/**
 * "Answered" per the type registry (§5.4, Phase 2 §3): unanswered keys are
 * absent from the map; the registered type refines presence into answeredness
 * (e.g. an ADDRESS needs its required sub-fields filled).
 */
export function isQuestionAnswered(
  norm: NormalizedDefinition,
  code: string,
  answers: AnswersMap,
): boolean {
  const q = norm.questionsByCode.get(code);
  return isAnswered(q?.type ?? '', answers[code], q?.typeConfig ?? {});
}
