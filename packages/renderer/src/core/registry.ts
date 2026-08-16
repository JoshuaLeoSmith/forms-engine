/**
 * Question-type registry, core (framework-free) half (Phase 1 §5.4, NFR-6;
 * Phase 2 §6). Each question type registers a module describing its typeConfig
 * contract, answer semantics, allowed rule operators (§4.2 — the matrix lives
 * HERE, not in rule-engine core), and answer format validation. The renderer
 * and the editor layer their own UI modules on top, keyed by the same type
 * ids. Adding a new type requires a new module here plus UI modules — zero
 * changes to navigation, persistence, rule-engine core, or schema
 * (docs/adding-a-question-type.md).
 */
import type { AnswerValue, Operator } from './types.js';
import { isValidIsoDate, localToday } from './dates.js';
import { defaultMessages, type MessageResolver } from './labels.js';

/** How the editor's rule builder should collect a condition value (FR2-16). */
export type ConditionValueKind =
  | 'text'
  | 'option'
  | 'number'
  | 'boolean'
  | 'date'
  | 'address'
  | 'none';

/** Context for answer validation; today is injectable for deterministic tests. */
export interface AnswerContext {
  today?: string;
  /**
   * Label resolver for validation messages (Phase 4 FR4-13). Absent = English
   * defaults; the live renderer passes its host-configured labels through.
   */
  messages?: MessageResolver;
}

export interface QuestionTypeCore {
  /** Type id, e.g. 'TEXT_BOX'. */
  type: string;
  /** Human-facing name for editor dropdowns. */
  label: string;
  /**
   * False for DISPLAY_BLOCK-style content entries: no code, never in the
   * answers map, never referenceable by rules, never counted in gating (§6.9).
   */
  answerable: boolean;
  /**
   * Operators legal when a rule condition references a question of this type
   * (§4.2). Empty = never referenceable (excluded from the rule builder).
   */
  allowedOperators: readonly Operator[];
  /** Value input the rule builder shows for conditions targeting this type. */
  conditionValueKind: ConditionValueKind;
  /** Default typeConfig for a freshly created question of this type. */
  defaultConfig(): Record<string, unknown>;
  /** Returns a list of human-readable problems; empty = valid. */
  validateConfig(config: Record<string, unknown>): string[];
  /** Whether a stored answer value counts as "answered" (gating, §3). */
  isAnswered(value: AnswerValue | undefined, config: Record<string, unknown>): boolean;
  /**
   * Format/range validation of a STORED answer (Phase 2: email/phone format,
   * number min/max/decimals, date range, US ZIP/state). A non-null message
   * blocks forward navigation exactly like a missing required answer, even
   * when the question itself is optional (§6.6). Pure; never called for
   * unanswered questions.
   */
  validateAnswer(
    value: AnswerValue,
    config: Record<string, unknown>,
    context?: AnswerContext,
  ): string | null;
}

const types = new Map<string, QuestionTypeCore>();

export function registerQuestionType(module: QuestionTypeCore): void {
  types.set(module.type, module);
}

export function getQuestionType(type: string): QuestionTypeCore | undefined {
  return types.get(type);
}

export function listQuestionTypes(): QuestionTypeCore[] {
  return [...types.values()];
}

export function isAnswered(
  type: string,
  value: AnswerValue | undefined,
  config: Record<string, unknown> = {},
): boolean {
  const mod = types.get(type);
  if (mod) {
    return mod.isAnswered(value, config);
  }
  return value !== undefined;
}

// ---------------------------------------------------------------------------
// Shared shapes & helpers
// ---------------------------------------------------------------------------

const EQ_OPS: readonly Operator[] = ['EQUALS', 'NOT_EQUALS'];

export interface OptionsConfig {
  options: { id: string; label: string }[];
}

function validateOptions(config: Record<string, unknown>): string[] {
  const options = (config as unknown as OptionsConfig).options;
  if (!Array.isArray(options) || options.length < 1) {
    return ['at least one option is required'];
  }
  for (const o of options) {
    if (!o || typeof o.id !== 'string' || typeof o.label !== 'string' || o.label.length === 0) {
      return ['every option needs an id and a non-empty label'];
    }
  }
  return [];
}

const isNonEmptyString = (v: AnswerValue | undefined): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isNullOrNumber = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v));

// ---------------------------------------------------------------------------
// TEXT_BOX (Phase 1, §6.1 enhancement: optional maxLength, resizable LARGE)
// ---------------------------------------------------------------------------

export type TextBoxSize = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface TextBoxConfig {
  size: TextBoxSize;
  maxLength?: number | null;
}

export const TEXT_BOX: QuestionTypeCore = {
  type: 'TEXT_BOX',
  label: 'Text Box',
  answerable: true,
  allowedOperators: EQ_OPS,
  conditionValueKind: 'text',
  defaultConfig: () => ({ size: 'MEDIUM', maxLength: null }),
  validateConfig: (config) => {
    const problems: string[] = [];
    const c = config as unknown as TextBoxConfig;
    if (c.size !== 'SMALL' && c.size !== 'MEDIUM' && c.size !== 'LARGE') {
      problems.push('size must be SMALL, MEDIUM or LARGE');
    }
    const max = c.maxLength;
    if (max !== null && max !== undefined && (!Number.isInteger(max) || max < 1 || max > 10000)) {
      problems.push('maxLength must be an integer between 1 and 10000');
    }
    return problems;
  },
  isAnswered: (value) => isNonEmptyString(value),
  validateAnswer: (value, config, context) => {
    const max = (config as unknown as TextBoxConfig).maxLength;
    if (typeof value === 'string' && typeof max === 'number' && value.length > max) {
      return (context?.messages ?? defaultMessages)('textMaxLengthError', { max });
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// RADIO (Phase 1)
// ---------------------------------------------------------------------------

export type RadioConfig = OptionsConfig;

export const RADIO: QuestionTypeCore = {
  type: 'RADIO',
  label: 'Radio',
  answerable: true,
  allowedOperators: EQ_OPS,
  conditionValueKind: 'option',
  defaultConfig: () => ({ options: [] }),
  validateConfig: validateOptions,
  isAnswered: (value) => typeof value === 'string' && value.length > 0,
  validateAnswer: () => null,
};

// ---------------------------------------------------------------------------
// CHECKBOX (§6.2) — answer is an array of selected labels, in option order
// ---------------------------------------------------------------------------

export interface CheckboxConfig extends OptionsConfig {
  maxSelections: number | null;
}

export const CHECKBOX: QuestionTypeCore = {
  type: 'CHECKBOX',
  label: 'Checkboxes',
  answerable: true,
  // EQUALS/NOT_EQUALS deliberately excluded (P2-D5).
  allowedOperators: ['CONTAINS', 'NOT_CONTAINS'],
  conditionValueKind: 'option',
  defaultConfig: () => ({ options: [], maxSelections: null }),
  validateConfig: (config) => {
    const problems = validateOptions(config);
    const c = config as unknown as CheckboxConfig;
    const max = c.maxSelections;
    if (max !== null && max !== undefined) {
      if (!Number.isInteger(max) || max < 1) {
        problems.push('maxSelections must be null or an integer ≥ 1');
      } else if (Array.isArray(c.options) && max > c.options.length) {
        problems.push('maxSelections cannot exceed the number of options');
      }
    }
    return problems;
  },
  isAnswered: (value) => Array.isArray(value) && value.length >= 1,
  validateAnswer: () => null,
};

// ---------------------------------------------------------------------------
// DROPDOWN (§6.3) — same options shape as RADIO, searchable single-select
// ---------------------------------------------------------------------------

export type DropdownConfig = OptionsConfig;

export const DROPDOWN: QuestionTypeCore = {
  type: 'DROPDOWN',
  label: 'Dropdown',
  answerable: true,
  allowedOperators: EQ_OPS,
  conditionValueKind: 'option',
  defaultConfig: () => ({ options: [] }),
  validateConfig: validateOptions,
  isAnswered: (value) => typeof value === 'string' && value.length > 0,
  validateAnswer: () => null,
};

// ---------------------------------------------------------------------------
// DATE (§6.4) — ISO YYYY-MM-DD strings, string comparison only
// ---------------------------------------------------------------------------

export interface DateConfig {
  minDate: string | null;
  maxDate: string | null;
  disallowPast: boolean;
  disallowFuture: boolean;
}

export const DATE: QuestionTypeCore = {
  type: 'DATE',
  label: 'Date',
  answerable: true,
  allowedOperators: ['EQUALS', 'NOT_EQUALS', 'BEFORE', 'AFTER'],
  conditionValueKind: 'date',
  defaultConfig: () => ({ minDate: null, maxDate: null, disallowPast: false, disallowFuture: false }),
  validateConfig: (config) => {
    const problems: string[] = [];
    const c = config as unknown as DateConfig;
    for (const key of ['minDate', 'maxDate'] as const) {
      const v = c[key];
      if (v !== null && v !== undefined && !isValidIsoDate(v)) {
        problems.push(`${key} must be a valid YYYY-MM-DD date`);
      }
    }
    if (isValidIsoDate(c.minDate) && isValidIsoDate(c.maxDate) && c.minDate > c.maxDate) {
      problems.push('minDate must not be after maxDate');
    }
    if (c.disallowPast === true && c.disallowFuture === true) {
      problems.push('no valid dates would remain except today; use min/max instead');
    }
    return problems;
  },
  isAnswered: (value) => typeof value === 'string' && value.length > 0,
  validateAnswer: (value, config, context) => {
    const msg = context?.messages ?? defaultMessages;
    if (typeof value !== 'string' || !isValidIsoDate(value)) {
      return msg('formatErrorDate');
    }
    const c = config as unknown as DateConfig;
    const today = context?.today ?? localToday();
    if (typeof c.minDate === 'string' && isValidIsoDate(c.minDate) && value < c.minDate) {
      return msg('dateMinError', { min: c.minDate });
    }
    if (typeof c.maxDate === 'string' && isValidIsoDate(c.maxDate) && value > c.maxDate) {
      return msg('dateMaxError', { max: c.maxDate });
    }
    if (c.disallowPast === true && value < today) {
      return msg('datePastError');
    }
    if (c.disallowFuture === true && value > today) {
      return msg('dateFutureError');
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// NUMBER (§6.5) — JSON number answers; 0 is a valid answer
// ---------------------------------------------------------------------------

export type NumberAdornment = 'NONE' | 'PERCENT' | 'CURRENCY';

export interface NumberConfig {
  min: number | null;
  max: number | null;
  decimalPlaces: number | null;
  adornment: NumberAdornment;
  currencySymbol: string;
}

export const NUMBER: QuestionTypeCore = {
  type: 'NUMBER',
  label: 'Number',
  answerable: true,
  allowedOperators: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN'],
  conditionValueKind: 'number',
  defaultConfig: () => ({ min: null, max: null, decimalPlaces: null, adornment: 'NONE', currencySymbol: '$' }),
  validateConfig: (config) => {
    const problems: string[] = [];
    const c = config as unknown as NumberConfig;
    if (!isNullOrNumber(c.min)) {
      problems.push('min must be null or a number');
    }
    if (!isNullOrNumber(c.max)) {
      problems.push('max must be null or a number');
    }
    if (typeof c.min === 'number' && typeof c.max === 'number' && c.min > c.max) {
      problems.push('min must not be greater than max');
    }
    const dp = c.decimalPlaces;
    if (dp !== null && dp !== undefined && (!Number.isInteger(dp) || dp < 0 || dp > 10)) {
      problems.push('decimalPlaces must be null or an integer between 0 and 10');
    }
    if (c.adornment !== undefined && !['NONE', 'PERCENT', 'CURRENCY'].includes(c.adornment)) {
      problems.push('adornment must be NONE, PERCENT or CURRENCY');
    }
    if (c.currencySymbol !== undefined && (typeof c.currencySymbol !== 'string' || c.currencySymbol.length > 4)) {
      problems.push('currencySymbol must be a string of at most 4 characters');
    }
    return problems;
  },
  // Key present = answered; never truthiness (0 is an answer, §3).
  isAnswered: (value) => typeof value === 'number' && Number.isFinite(value),
  validateAnswer: (value, config, context) => {
    const msg = context?.messages ?? defaultMessages;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return msg('numberInvalidError');
    }
    const c = config as unknown as NumberConfig;
    if (typeof c.min === 'number' && value < c.min) {
      return msg('numberMinError', { min: c.min });
    }
    if (typeof c.max === 'number' && value > c.max) {
      return msg('numberMaxError', { max: c.max });
    }
    if (typeof c.decimalPlaces === 'number') {
      const factor = 10 ** c.decimalPlaces;
      if (Math.round(value * factor) / factor !== value) {
        return c.decimalPlaces === 0
          ? msg('numberWholeError')
          : msg('numberDecimalsError', { n: c.decimalPlaces });
      }
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// EMAIL / PHONE (§6.6) — text inputs with format validation
// ---------------------------------------------------------------------------

/** Pragmatic, not RFC 5321: one @, non-empty local part, dotted domain, no spaces. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL: QuestionTypeCore = {
  type: 'EMAIL',
  label: 'Email',
  answerable: true,
  allowedOperators: EQ_OPS,
  conditionValueKind: 'text',
  defaultConfig: () => ({}),
  validateConfig: () => [],
  isAnswered: (value) => isNonEmptyString(value),
  validateAnswer: (value, _config, context) =>
    typeof value === 'string' && EMAIL_PATTERN.test(value)
      ? null
      : (context?.messages ?? defaultMessages)('formatErrorEmail'),
};

/** Permissive: digits, + ( ) - . and spaces; 7–15 digits total. */
export function isValidPhone(value: string): boolean {
  if (!/^[\d+().\-\s]+$/.test(value)) {
    return false;
  }
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export const PHONE: QuestionTypeCore = {
  type: 'PHONE',
  label: 'Phone',
  answerable: true,
  allowedOperators: EQ_OPS,
  conditionValueKind: 'text',
  defaultConfig: () => ({}),
  validateConfig: () => [],
  isAnswered: (value) => isNonEmptyString(value),
  validateAnswer: (value, _config, context) =>
    typeof value === 'string' && isValidPhone(value)
      ? null
      : (context?.messages ?? defaultMessages)('formatErrorPhone'),
};

// ---------------------------------------------------------------------------
// TOGGLE (§6.7) — boolean with no default state (P2-D4)
// ---------------------------------------------------------------------------

export interface ToggleConfig {
  trueLabel: string;
  falseLabel: string;
}

export const TOGGLE: QuestionTypeCore = {
  type: 'TOGGLE',
  label: 'Toggle',
  answerable: true,
  allowedOperators: EQ_OPS,
  conditionValueKind: 'boolean',
  defaultConfig: () => ({ trueLabel: 'Yes', falseLabel: 'No' }),
  validateConfig: (config) => {
    const c = config as unknown as ToggleConfig;
    const problems: string[] = [];
    if (typeof c.trueLabel !== 'string' || c.trueLabel.trim().length === 0) {
      problems.push('trueLabel must be a non-empty string');
    }
    if (typeof c.falseLabel !== 'string' || c.falseLabel.trim().length === 0) {
      problems.push('falseLabel must be a non-empty string');
    }
    return problems;
  },
  // Key present = answered; false is a deliberate act, never a default (§3).
  isAnswered: (value) => typeof value === 'boolean',
  validateAnswer: () => null,
};

// ---------------------------------------------------------------------------
// ADDRESS (§6.8) — grouped sub-fields answering as one flat string object
// ---------------------------------------------------------------------------

export const ADDRESS_SUB_FIELDS = ['country', 'line1', 'line2', 'city', 'state', 'postalCode'] as const;
export type AddressSubField = (typeof ADDRESS_SUB_FIELDS)[number];
/** country, line1 and city are always enabled (§6.8.1). */
export const ADDRESS_ALWAYS_ENABLED: readonly AddressSubField[] = ['country', 'line1', 'city'];

export interface AddressConfig {
  enabledFields: Partial<Record<AddressSubField, boolean>>;
  requiredFields: Partial<Record<AddressSubField, boolean>>;
  defaultCountry: string | null;
  autocomplete: boolean;
}

export function addressEnabledFields(config: Record<string, unknown>): AddressSubField[] {
  const c = config as unknown as AddressConfig;
  return ADDRESS_SUB_FIELDS.filter(
    (f) => ADDRESS_ALWAYS_ENABLED.includes(f) || c.enabledFields?.[f] === true,
  );
}

export function addressRequiredFields(config: Record<string, unknown>): AddressSubField[] {
  const c = config as unknown as AddressConfig;
  const enabled = addressEnabledFields(config);
  return enabled.filter((f) => c.requiredFields?.[f] === true);
}

export const US_ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

export const ADDRESS: QuestionTypeCore = {
  type: 'ADDRESS',
  label: 'Address',
  answerable: true,
  allowedOperators: EQ_OPS,
  conditionValueKind: 'address',
  defaultConfig: () => ({
    enabledFields: { line2: true, state: true, postalCode: true },
    requiredFields: { country: true, line1: true, city: true, state: true, postalCode: true },
    defaultCountry: 'US',
    autocomplete: true,
  }),
  validateConfig: (config) => {
    const problems: string[] = [];
    const c = config as unknown as AddressConfig;
    if (c.enabledFields !== undefined && (typeof c.enabledFields !== 'object' || c.enabledFields === null)) {
      problems.push('enabledFields must be an object of booleans');
      return problems;
    }
    if (c.requiredFields !== undefined && (typeof c.requiredFields !== 'object' || c.requiredFields === null)) {
      problems.push('requiredFields must be an object of booleans');
      return problems;
    }
    const enabled = new Set(addressEnabledFields(config));
    for (const [field, required] of Object.entries(c.requiredFields ?? {})) {
      if (!ADDRESS_SUB_FIELDS.includes(field as AddressSubField)) {
        problems.push(`unknown address sub-field: ${field}`);
      } else if (required === true && !enabled.has(field as AddressSubField)) {
        problems.push(`required sub-field ${field} must also be enabled`);
      }
    }
    for (const field of Object.keys(c.enabledFields ?? {})) {
      if (!ADDRESS_SUB_FIELDS.includes(field as AddressSubField)) {
        problems.push(`unknown address sub-field: ${field}`);
      }
    }
    if (
      c.defaultCountry !== null &&
      c.defaultCountry !== undefined &&
      (typeof c.defaultCountry !== 'string' || !/^[A-Z]{2}$/.test(c.defaultCountry))
    ) {
      problems.push('defaultCountry must be null or a two-letter country code');
    }
    return problems;
  },
  // Answered = every enabled required sub-field non-empty (§6.8.3).
  isAnswered: (value, config) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const obj = value as Record<string, string>;
    return addressRequiredFields(config).every(
      (f) => typeof obj[f] === 'string' && obj[f].trim().length > 0,
    );
  },
  validateAnswer: (value, _config, context) => {
    const msg = context?.messages ?? defaultMessages;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return msg('addressInvalidError');
    }
    const obj = value as Record<string, string>;
    // US "bells and whistles" mode (§6.8.2): ZIP format when present.
    if (obj['country'] === 'US' && typeof obj['postalCode'] === 'string' && obj['postalCode'].trim() !== '') {
      if (!US_ZIP_PATTERN.test(obj['postalCode'].trim())) {
        return msg('zipFormatError');
      }
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// DISPLAY_BLOCK (§6.9) — not a question; content only
// ---------------------------------------------------------------------------

export interface DisplayBlockConfig {
  content: string;
}

export const DISPLAY_BLOCK: QuestionTypeCore = {
  type: 'DISPLAY_BLOCK',
  label: 'Display text',
  answerable: false,
  allowedOperators: [],
  conditionValueKind: 'none',
  defaultConfig: () => ({ content: '' }),
  validateConfig: (config) => {
    const c = config as unknown as DisplayBlockConfig;
    return typeof c.content === 'string' ? [] : ['content must be a string'];
  },
  isAnswered: () => false,
  validateAnswer: () => null,
};

// ---------------------------------------------------------------------------
// FILE_UPLOAD (Phase 3 §5) — answer is always an array of file references
// ---------------------------------------------------------------------------

/**
 * Category → extensions allowlist (Phase 3 §5.1, FR3-14). Mirror of the
 * server-owned table for client-side pre-checks and the `accept` attribute —
 * the server's content verification is the enforcement, this is convenience.
 */
export const FILE_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  DOCUMENTS: ['pdf', 'doc', 'docx'],
  IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  SPREADSHEETS: ['xls', 'xlsx', 'csv'],
  TEXT: ['txt', 'md'],
  ARCHIVES: ['zip'],
};

export interface FileUploadConfig {
  allowedCategories: string[];
  maxFiles: number;
  maxFileSizeMb: number;
  helperText?: string | null;
}

/** Allowed extensions (lower-case, no dots) for a FILE_UPLOAD config. */
export function fileUploadExtensions(config: Record<string, unknown>): string[] {
  const categories = (config as unknown as FileUploadConfig).allowedCategories;
  if (!Array.isArray(categories)) {
    return [];
  }
  const extensions: string[] = [];
  for (const category of categories) {
    for (const ext of FILE_CATEGORIES[category] ?? []) {
      if (!extensions.includes(ext)) {
        extensions.push(ext);
      }
    }
  }
  return extensions;
}

/**
 * Constraint summary shown under the dropzone in both the live renderer and
 * the inert editor preview (FR3-16/17), e.g. "PDF, DOC, DOCX · up to 2 files
 * · 10 MB each".
 */
export function fileUploadConstraintSummary(
  config: Record<string, unknown>,
  messages: MessageResolver = defaultMessages,
): string {
  const c = config as unknown as FileUploadConfig;
  const extensions = fileUploadExtensions(config).map((e) => e.toUpperCase());
  const maxFiles = typeof c.maxFiles === 'number' ? c.maxFiles : 1;
  const sizeMb = typeof c.maxFileSizeMb === 'number' ? c.maxFileSizeMb : 10;
  const parts = [
    extensions.length > 0 ? extensions.join(', ') : messages('uploadSummaryNoTypes'),
    maxFiles === 1 ? messages('uploadSummaryOneFile') : messages('uploadSummaryManyFiles', { n: maxFiles }),
    messages('uploadSummaryEach', { n: sizeMb }),
  ];
  return parts.join(' · ');
}

const isFileReference = (v: unknown): boolean =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  typeof (v as { fileId?: unknown }).fileId === 'string' &&
  typeof (v as { fileName?: unknown }).fileName === 'string' &&
  typeof (v as { size?: unknown }).size === 'number' &&
  typeof (v as { contentType?: unknown }).contentType === 'string';

export const FILE_UPLOAD: QuestionTypeCore = {
  type: 'FILE_UPLOAD',
  label: 'File upload',
  answerable: true,
  // P3-D6: never referenceable by rules — no "has uploaded" special case.
  allowedOperators: [],
  conditionValueKind: 'none',
  defaultConfig: () => ({
    allowedCategories: ['DOCUMENTS'],
    maxFiles: 1,
    maxFileSizeMb: 10,
    helperText: '',
  }),
  validateConfig: (config) => {
    const problems: string[] = [];
    const c = config as unknown as FileUploadConfig;
    const categories = c.allowedCategories;
    if (!Array.isArray(categories) || categories.length < 1) {
      problems.push('at least one file category is required');
    } else {
      for (const category of categories) {
        if (typeof category !== 'string' || FILE_CATEGORIES[category] === undefined) {
          problems.push(`unknown file category: ${String(category)}`);
        }
      }
    }
    if (!Number.isInteger(c.maxFiles) || c.maxFiles < 1 || c.maxFiles > 10) {
      problems.push('maxFiles must be an integer between 1 and 10');
    }
    if (!Number.isInteger(c.maxFileSizeMb) || c.maxFileSizeMb < 1) {
      problems.push('maxFileSizeMb must be an integer ≥ 1');
    }
    if (
      c.helperText !== undefined &&
      c.helperText !== null &&
      (typeof c.helperText !== 'string' || c.helperText.length > 500)
    ) {
      problems.push('helperText must be a string of at most 500 characters');
    }
    return problems;
  },
  // Answered = ≥ 1 file in a terminal success state (FR3-9); in-flight and
  // failed uploads never enter the answer.
  isAnswered: (value) => Array.isArray(value) && value.length >= 1 && value.every(isFileReference),
  validateAnswer: (value, _config, context) =>
    Array.isArray(value) && value.every(isFileReference)
      ? null
      : (context?.messages ?? defaultMessages)('uploadInvalidError'),
};

registerQuestionType(TEXT_BOX);
registerQuestionType(RADIO);
registerQuestionType(CHECKBOX);
registerQuestionType(DROPDOWN);
registerQuestionType(DATE);
registerQuestionType(NUMBER);
registerQuestionType(EMAIL);
registerQuestionType(PHONE);
registerQuestionType(TOGGLE);
registerQuestionType(ADDRESS);
registerQuestionType(FILE_UPLOAD);
registerQuestionType(DISPLAY_BLOCK);
