# Renderer strings override (`labels`)

Every respondent-facing string the `<forms-engine>` component emits can be
overridden per key via the `labels` attribute (JSON string) or property
(object). Any key not supplied falls back to the built-in English default —
**partial overrides are the expected case**.

```html
<forms-engine
  public-id="q_8f3k2m"
  api-base="https://forms.your-domain.com"
  labels='{"finish":"Enviar","requiredError":"Este campo es obligatorio"}'>
</forms-engine>
```

This is a **strings override, not internationalization**: one language per
embed instance, no locale negotiation, no pluralization engine (defaults are
worded so plurals are never needed). Question content is already your own text
in the definition. Placeholders use `{name}` interpolation — simple string
substitution; keys with placeholders document them below. Unknown keys and
non-string values are ignored; unparseable JSON logs a console warning and
falls back to all defaults — bad input never breaks a live form.

> **Definition of done (FR4-14):** this table is exhaustive. Every future
> renderer feature that adds a respondent-facing string must add its key here
> in the same change.

## Navigation & shell chrome

| Key | Default |
|---|---|
| `next` | `Next` |
| `back` | `Back` |
| `finish` | `Finish` |
| `finishing` | `Submitting…` |
| `loading` | `Loading…` |
| `loadErrorTitle` | `Something went wrong` |
| `loadErrorNotFound` | `This questionnaire is not available.` |
| `loadErrorGeneric` | `The questionnaire could not be loaded.` |
| `emptyState` | `There is nothing to fill in right now.` |
| `completionTitle` | `Thank you!` |
| `completionMessage` | `Your response has been submitted.` |
| `savingError` | `Your answers aren't saving right now. We'll keep trying — please don't close this page.` |
| `requiredError` | `This question is required.` |
| `unknownTypePlaceholder` | `This question requires a newer version of the form component.` |
| `alreadySubmittedMessage` | `You've already submitted this form.` (Phase 5 FR5-11 — shown when the supplied `external-ref` has already completed the form) |
| `refMissingError` | `This form is misconfigured: an external reference is required.` (Phase 5 FR5-5 — shown when a `ONE_PER_REF` questionnaire is embedded without `external-ref`) |
| `attentionOne` | `1 question needs attention before continuing.` |
| `attentionMany` | `{n} questions need attention before continuing.` |
| `stepsNavLabel` | `Steps` |
| `tabsNavLabel` | `Sections of this step` |

## Answer format validation

| Key | Default |
|---|---|
| `textMaxLengthError` | `Please use at most {max} characters.` |
| `formatErrorEmail` | `Enter a valid email address.` |
| `formatErrorPhone` | `Enter a valid phone number.` |
| `formatErrorDate` | `Enter a valid date (YYYY-MM-DD).` |
| `dateMinError` | `The date must be on or after {min}.` |
| `dateMaxError` | `The date must be on or before {max}.` |
| `datePastError` | `The date cannot be in the past.` |
| `dateFutureError` | `The date cannot be in the future.` |
| `numberInvalidError` | `Enter a number.` |
| `numberMinError` | `The value must be at least {min}.` |
| `numberMaxError` | `The value must be at most {max}.` |
| `numberWholeError` | `Enter a whole number.` |
| `numberDecimalsError` | `Use at most {n} decimal places.` |
| `addressInvalidError` | `Enter an address.` |
| `zipFormatError` | `Enter a valid ZIP code (12345 or 12345-6789).` |
| `uploadInvalidError` | `Upload a file.` |

> The Phase-4 BRD sketched single `numberRangeError` / `dateRangeError` keys;
> the implementation keeps the more precise per-violation messages that
> shipped in Phase 2 (min, max, past, future are distinct keys), so nothing
> respondents already see got coarser.

## Choice controls

| Key | Default |
|---|---|
| `checkboxMaxHint` | `Select up to {n}.` |
| `dropdownPlaceholder` | `Select…` |
| `dropdownSearchLabel` | `Search options` (aria) |
| `dropdownSearchPlaceholder` | `Type to filter…` |
| `dropdownNoMatches` | `No matches` |
| `dropdownClearLabel` | `Clear selection` (aria) |

## Date input & calendar

| Key | Default |
|---|---|
| `datePlaceholder` | `YYYY-MM-DD` |
| `dateOpenCalendarLabel` | `Open calendar` (aria) |
| `dateDialogLabel` | `Choose a date` (aria) |
| `datePrevMonthLabel` | `Previous month` (aria) |
| `dateNextMonthLabel` | `Next month` (aria) |
| `dateMonthNames` | `January,February,…,December` — comma-separated, January first |
| `dateWeekdayNames` | `Su,Mo,Tu,We,Th,Fr,Sa` — comma-separated, Sunday first |

## Address

| Key | Default |
|---|---|
| `addressCountry` | `Country` |
| `addressLine1` | `Street address` |
| `addressLine2` | `Address line 2` |
| `addressCity` | `City` |
| `addressState` | `State / Province / Region` |
| `addressStateUs` | `State` (label when the country is US) |
| `addressPostalCode` | `Postal code` |
| `addressZipCode` | `ZIP code` (label when the country is US) |
| `addressCountryPlaceholder` | `Select a country…` |
| `addressStatePlaceholder` | `Select a state…` |
| `addressCountrySearchLabel` | `Search countries` (aria) |
| `addressStateSearchLabel` | `Search states` (aria) |

## File upload

| Key | Default |
|---|---|
| `uploadPrompt` | `Drag & drop or click to browse` |
| `uploadLimitReached` | `File limit reached` |
| `uploadSingleAttached` | `A file is already attached — remove it first.` |
| `uploadMaxFilesNotice` | `Up to {n} files are allowed.` |
| `uploadSurplusNotice` | `Only {n} more can be added — the rest were skipped.` |
| `uploadTypeNotAccepted` | `This file type isn't accepted. Allowed: {extensions}.` |
| `uploadTooLarge` | `This file is larger than the {max} MB limit.` |
| `uploadFailed` | `The upload failed.` |
| `uploadRetry` | `Retry` |
| `uploadWaitToContinue` | `Waiting for the upload to finish.` |
| `uploadRemoveLabel` | `Remove {name}` (aria) |
| `uploadCancelLabel` | `Cancel uploading {name}` (aria) |
| `uploadDismissLabel` | `Dismiss {name}` (aria) |
| `uploadUploadingLabel` | `Uploading {name}` (aria) |
| `uploadPreviewTag` | `preview — not uploaded` (editor draft preview only) |
| `uploadSummaryNoTypes` | `No file types configured` |
| `uploadSummaryOneFile` | `1 file` |
| `uploadSummaryManyFiles` | `up to {n} files` |
| `uploadSummaryEach` | `{n} MB each` |

Server-generated messages (upload rejections such as content-type mismatches)
are produced by the backend and pass through verbatim — they are part of the
API, not the renderer's string table.
