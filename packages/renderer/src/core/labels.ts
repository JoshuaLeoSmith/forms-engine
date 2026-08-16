/**
 * Renderer strings catalog (Phase 4 §6, FR4-13/14).
 *
 * Every respondent-facing string the renderer emits lives here, keyed, with
 * the English default. Hosts override per key via the <forms-engine> `labels`
 * property/attribute; any key not supplied falls back to English — partial
 * overrides are the expected case. This is a strings override, not
 * internationalization: one language per embed, `{name}` interpolation only,
 * no pluralization engine (messages are worded to avoid needing one).
 *
 * The full key set is documented in docs/renderer-labels.md, which is kept
 * exhaustive as a definition-of-done rule for every future renderer feature.
 */

export const DEFAULT_LABELS = {
  // ---- navigation & shell chrome ------------------------------------------
  next: 'Next',
  back: 'Back',
  finish: 'Finish',
  finishing: 'Submitting…',
  loading: 'Loading…',
  loadErrorTitle: 'Something went wrong',
  loadErrorNotFound: 'This questionnaire is not available.',
  loadErrorGeneric: 'The questionnaire could not be loaded.',
  emptyState: 'There is nothing to fill in right now.',
  completionTitle: 'Thank you!',
  completionMessage: 'Your response has been submitted.',
  savingError: "Your answers aren't saving right now. We'll keep trying — please don't close this page.",
  requiredError: 'This question is required.',
  unknownTypePlaceholder: 'This question requires a newer version of the form component.',
  // Phase 5 (FR5-5/11): external-reference states.
  alreadySubmittedMessage: "You've already submitted this form.",
  refMissingError: 'This form is misconfigured: an external reference is required.',
  attentionOne: '1 question needs attention before continuing.',
  attentionMany: '{n} questions need attention before continuing.',
  stepsNavLabel: 'Steps',
  tabsNavLabel: 'Sections of this step',

  // ---- answer format validation (registry, §6.4–6.8) ----------------------
  textMaxLengthError: 'Please use at most {max} characters.',
  formatErrorEmail: 'Enter a valid email address.',
  formatErrorPhone: 'Enter a valid phone number.',
  formatErrorDate: 'Enter a valid date (YYYY-MM-DD).',
  dateMinError: 'The date must be on or after {min}.',
  dateMaxError: 'The date must be on or before {max}.',
  datePastError: 'The date cannot be in the past.',
  dateFutureError: 'The date cannot be in the future.',
  numberInvalidError: 'Enter a number.',
  numberMinError: 'The value must be at least {min}.',
  numberMaxError: 'The value must be at most {max}.',
  numberWholeError: 'Enter a whole number.',
  numberDecimalsError: 'Use at most {n} decimal places.',
  addressInvalidError: 'Enter an address.',
  zipFormatError: 'Enter a valid ZIP code (12345 or 12345-6789).',
  uploadInvalidError: 'Upload a file.',

  // ---- choice controls ------------------------------------------------------
  checkboxMaxHint: 'Select up to {n}.',
  dropdownPlaceholder: 'Select…',
  dropdownSearchLabel: 'Search options',
  dropdownSearchPlaceholder: 'Type to filter…',
  dropdownNoMatches: 'No matches',
  dropdownClearLabel: 'Clear selection',

  // ---- date input & calendar -----------------------------------------------
  datePlaceholder: 'YYYY-MM-DD',
  dateOpenCalendarLabel: 'Open calendar',
  dateDialogLabel: 'Choose a date',
  datePrevMonthLabel: 'Previous month',
  dateNextMonthLabel: 'Next month',
  /** Comma-separated, January first. */
  dateMonthNames: 'January,February,March,April,May,June,July,August,September,October,November,December',
  /** Comma-separated, Sunday first. */
  dateWeekdayNames: 'Su,Mo,Tu,We,Th,Fr,Sa',

  // ---- address --------------------------------------------------------------
  addressCountry: 'Country',
  addressLine1: 'Street address',
  addressLine2: 'Address line 2',
  addressCity: 'City',
  addressState: 'State / Province / Region',
  addressStateUs: 'State',
  addressPostalCode: 'Postal code',
  addressZipCode: 'ZIP code',
  addressCountryPlaceholder: 'Select a country…',
  addressStatePlaceholder: 'Select a state…',
  addressCountrySearchLabel: 'Search countries',
  addressStateSearchLabel: 'Search states',

  // ---- file upload (Phase 3 §5.3) ------------------------------------------
  uploadPrompt: 'Drag & drop or click to browse',
  uploadLimitReached: 'File limit reached',
  uploadSingleAttached: 'A file is already attached — remove it first.',
  uploadMaxFilesNotice: 'Up to {n} files are allowed.',
  uploadSurplusNotice: 'Only {n} more can be added — the rest were skipped.',
  uploadTypeNotAccepted: "This file type isn't accepted. Allowed: {extensions}.",
  uploadTooLarge: 'This file is larger than the {max} MB limit.',
  uploadFailed: 'The upload failed.',
  uploadRetry: 'Retry',
  uploadWaitToContinue: 'Waiting for the upload to finish.',
  uploadRemoveLabel: 'Remove {name}',
  uploadCancelLabel: 'Cancel uploading {name}',
  uploadDismissLabel: 'Dismiss {name}',
  uploadUploadingLabel: 'Uploading {name}',
  uploadPreviewTag: 'preview — not uploaded',
  uploadSummaryNoTypes: 'No file types configured',
  uploadSummaryOneFile: '1 file',
  uploadSummaryManyFiles: 'up to {n} files',
  uploadSummaryEach: '{n} MB each',
} as const;

export type LabelKey = keyof typeof DEFAULT_LABELS;

export type Labels = Readonly<Record<LabelKey, string>>;

/**
 * Resolves a label by key with `{name}` interpolation. The single indirection
 * every string in the renderer goes through; components without an override
 * source use {@link defaultMessages}.
 */
export type MessageResolver = (key: LabelKey, params?: Record<string, string | number>) => string;

/** Simple `{name}` substitution (FR4-14) — no escaping, no pluralization. */
export function formatLabel(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Merges a host-supplied override object (or JSON string, when set as an HTML
 * attribute) over the English defaults. Unknown keys and non-string values are
 * ignored; anything unparseable yields the defaults — bad input must never
 * break a live form.
 */
export function resolveLabels(input: unknown): Labels {
  let overrides: unknown = input;
  if (typeof input === 'string' && input.trim() !== '') {
    try {
      overrides = JSON.parse(input);
    } catch {
      console.warn('forms-engine: the labels attribute is not valid JSON; using defaults');
      overrides = null;
    }
  }
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
    return DEFAULT_LABELS;
  }
  const merged: Record<string, string> = { ...DEFAULT_LABELS };
  for (const [key, value] of Object.entries(overrides)) {
    if (key in DEFAULT_LABELS && typeof value === 'string') {
      merged[key] = value;
    }
  }
  return merged as Labels;
}

/** Message resolver over a resolved label set. */
export function messagesFor(labels: Labels): MessageResolver {
  return (key, params) => formatLabel(labels[key], params);
}

/** English-default resolver, used wherever no host override is in scope. */
export const defaultMessages: MessageResolver = messagesFor(DEFAULT_LABELS);
