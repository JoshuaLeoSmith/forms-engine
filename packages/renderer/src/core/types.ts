/**
 * Forms-Engine definition schema (schemaVersion 2) and shared model types.
 *
 * These types mirror the JSON contract in the BRDs (Phase 1 §5.2, Phase 2 §3–4)
 * exactly. They are the single source of truth for the renderer, the editor,
 * and (structurally) the backend's stored documents. schemaVersion 1 documents
 * are a strict subset of v2 semantics (FR2-1) — the same types describe both.
 */

export const SCHEMA_VERSION = 2;
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];

/** Combinator across all conditions of one rule. ALL = AND, ANY = OR. */
export type Combinator = 'ALL' | 'ANY';

/**
 * Where a condition reads its comparison value from. Only QUESTION is
 * supported; the discriminator exists so EXTERNAL sources can be added without
 * a schema migration (Phase 1 §6.5). Unknown sources evaluate to false.
 */
export type ConditionSource = 'QUESTION' | (string & {});

/**
 * Open string enum (NFR-6). Phase 2 adds the checkbox/number/date operators
 * (§4.2); unknown operators evaluate to false.
 */
export type Operator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'BEFORE'
  | 'AFTER'
  | (string & {});

/** Visibility / requirement mode (Phase 1 §6.2 / §6.4). */
export type RuleMode = 'ALWAYS' | 'CONDITIONAL' | 'NEVER';

export type QuestionWidth = 'DEFAULT' | 'HALF' | 'FULL';

/**
 * Condition comparison value, typed to the referenced question (FR2-7):
 * number for NUMBER targets, boolean for TOGGLE targets, string otherwise.
 */
export type ConditionValue = string | number | boolean;

export interface Condition {
  source: ConditionSource;
  questionCode: string;
  /**
   * Only valid when the referenced question is ADDRESS: names the enabled
   * sub-field whose string value is compared (FR2-6, P2-D3).
   */
  subField?: string;
  operator: Operator;
  value: ConditionValue;
}

export interface Rule {
  combinator: Combinator;
  conditions: Condition[];
}

export interface RuleConfig {
  mode: RuleMode;
  /** Present iff mode === 'CONDITIONAL'. */
  rule?: Rule;
}

export interface SelectOption {
  id: string;
  label: string;
}

/** @deprecated Phase-1 name; RADIO/CHECKBOX/DROPDOWN all share this shape. */
export type RadioOption = SelectOption;

export interface QuestionDef {
  /** Internal UUID, stable across renames/reorders. */
  id: string;
  /**
   * Developer-chosen question code — the key in answers and in rules (§5.3).
   * DISPLAY_BLOCK entries have no code (empty/absent — §6.9): they are never
   * answered and never referenceable.
   */
  code: string;
  /** Consecutive questions sharing a sectionTitle group into one card (§5.1). */
  sectionTitle: string;
  prompt: string;
  /** Question type id, resolved through the type registry (§5.4). */
  type: string;
  width: QuestionWidth;
  /** Per-type payload, validated by the type's registry module. */
  typeConfig: Record<string, unknown>;
  visibility: RuleConfig;
  requirement: RuleConfig;
}

export interface TabDef {
  id: string;
  title: string;
  visibility: RuleConfig;
  requirement: RuleConfig;
  questions: QuestionDef[];
}

export interface StepDef {
  id: string;
  title: string;
  visibility: RuleConfig;
  requirement: RuleConfig;
  /** Exactly one of tabs | questions is non-empty (§5.1). */
  tabs: TabDef[];
  questions: QuestionDef[];
}

export interface Definition {
  schemaVersion: number;
  /** Exactly one of steps | tabs | questions is non-empty (§5.1). */
  steps: StepDef[];
  tabs: TabDef[];
  questions: QuestionDef[];
}

/**
 * Reference to an uploaded file (Phase 3 §4.2, FR3-9). A convenience copy of
 * the metadata; the backend's `uploaded_files` collection is authoritative.
 */
export interface FileReference {
  fileId: string;
  fileName: string;
  size: number;
  contentType: string;
}

/**
 * Answer value, typed per question type (Phase 2 §3, Phase 3 §4.2):
 * - string — TEXT_BOX, EMAIL, PHONE, RADIO, DROPDOWN, DATE (ISO `YYYY-MM-DD`)
 * - number — NUMBER (`0` is a valid answer; never truthiness-check)
 * - boolean — TOGGLE (`false` is a valid answer)
 * - string[] — CHECKBOX (selected labels in option order; never empty)
 * - Record<string, string> — ADDRESS (flat sub-field object, §6.8.3)
 * - FileReference[] — FILE_UPLOAD (always an array, even when maxFiles = 1; P3-D3)
 */
export type AnswerValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string>
  | FileReference[];

/** Flat answers map: question code → typed value. Unanswered = key absent. */
export type AnswersMap = Record<string, AnswerValue>;

export interface ScreenPosition {
  stepId: string;
  tabId: string;
}

/** Question-code pattern (§5.3). Case-sensitive, unique per questionnaire. */
export const QUESTION_CODE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

export function alwaysVisible(): RuleConfig {
  return { mode: 'ALWAYS' };
}

export function neverRequired(): RuleConfig {
  return { mode: 'NEVER' };
}

export function alwaysRequired(): RuleConfig {
  return { mode: 'ALWAYS' };
}

/** An empty definition, the starting draft of a new questionnaire. */
export function emptyDefinition(): Definition {
  return { schemaVersion: SCHEMA_VERSION, steps: [], tabs: [], questions: [] };
}
