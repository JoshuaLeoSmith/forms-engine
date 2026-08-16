/**
 * Renderer-side half of the question-type registry (§5.4, Phase 2 §6): maps a
 * type id to a Lit template. Registering a new type here (plus its core
 * module) is all the renderer needs — navigation, gating, persistence and the
 * rule engine are type-agnostic.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { AnswerValue, FileReference, QuestionDef } from '../core/types.js';
import type {
  CheckboxConfig,
  DateConfig,
  DisplayBlockConfig,
  DropdownConfig,
  NumberConfig,
  RadioConfig,
  TextBoxConfig,
  ToggleConfig,
} from '../core/registry.js';
import { renderMarkdown } from '../core/markdown.js';
import { defaultMessages, type MessageResolver } from '../core/labels.js';
import type { GeocodeSuggestion } from '../api/client.js';
import { defineFeSelect } from './fe-select.js';
import { defineFeDateInput } from './fe-date-input.js';
import { defineFeAddress } from './fe-address.js';
import { defineFeUpload, type UploadContext } from './fe-upload.js';

defineFeSelect();
defineFeDateInput();
defineFeAddress();
defineFeUpload();

export interface QuestionRenderContext {
  question: QuestionDef;
  /** Stored (typed) answer value, or undefined when unanswered. */
  value: AnswerValue | undefined;
  required: boolean;
  /** True when this question is currently blocking navigation (FR-L-5). */
  invalid: boolean;
  /** Inline message to display (format error or required prompt), if any. */
  error: string | null;
  /** Inert mode: the editor preview renders with all inputs disabled (FR-E-5). */
  disabled: boolean;
  /** Store a typed answer; undefined clears the key (FR2-4). */
  onChange: (value: AnswerValue | undefined) => void;
  /**
   * Report unparseable input that never became an answer but must still block
   * navigation (e.g. garbage date text, §6.4). null clears the report.
   */
  onFieldError: (message: string | null) => void;
  /** Geocode lookup for ADDRESS autocomplete (§6.8.4); absent = disabled. */
  geocode?: (query: string, country?: string) => Promise<GeocodeSuggestion[]>;
  /** Upload plumbing for FILE_UPLOAD (Phase 3 §5.3); absent = inert preview. */
  uploads?: UploadContext;
  /**
   * Reports this question's in-flight upload count so the host can block
   * forward navigation while a transfer is running (FR3-18).
   */
  onUploadBusy?: (count: number) => void;
  /** Host-resolved strings (Phase 4 FR4-13); absent = English defaults. */
  labels?: MessageResolver;
}

export type QuestionRenderer = (ctx: QuestionRenderContext) => TemplateResult;

const renderers = new Map<string, QuestionRenderer>();

export function registerQuestionRenderer(type: string, renderer: QuestionRenderer): void {
  renderers.set(type, renderer);
}

export function getQuestionRenderer(type: string): QuestionRenderer | undefined {
  return renderers.get(type);
}

function fieldId(q: QuestionDef): string {
  return `fe-q-${q.id}`;
}

function errorId(q: QuestionDef): string {
  return `fe-err-${q.id}`;
}

function renderLabel(ctx: QuestionRenderContext, forId: string): TemplateResult {
  return html`<label class="fe-label" for=${forId}>
    ${ctx.question.prompt}${ctx.required
      ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
      : nothing}
  </label>`;
}

function renderLegend(ctx: QuestionRenderContext): TemplateResult {
  return html`<legend class="fe-label">
    ${ctx.question.prompt}${ctx.required
      ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
      : nothing}
  </legend>`;
}

export function renderValidationMessage(ctx: QuestionRenderContext): TemplateResult | typeof nothing {
  if (!ctx.error) {
    return nothing;
  }
  return html`<p class="fe-error-message" id=${errorId(ctx.question)}>${ctx.error}</p>`;
}

const describedBy = (ctx: QuestionRenderContext) => (ctx.error ? errorId(ctx.question) : nothing);

const normalizeText = (raw: string): string | undefined => {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

// ---------------------------------------------------------------------------
// TEXT_BOX — §6.1: optional maxLength + counter, resizable LARGE
// ---------------------------------------------------------------------------

registerQuestionRenderer('TEXT_BOX', (ctx) => {
  const config = ctx.question.typeConfig as unknown as TextBoxConfig;
  const size = config?.size ?? 'MEDIUM';
  const maxLength = typeof config?.maxLength === 'number' ? config.maxLength : null;
  const id = fieldId(ctx.question);
  const length = typeof ctx.value === 'string' ? ctx.value.length : 0;
  const onInput = (e: Event) => ctx.onChange(normalizeText((e.target as HTMLInputElement).value));
  return html`
    <div class="fe-field">
      ${renderLabel(ctx, id)}
      ${size === 'LARGE'
        ? html`<textarea
            class="fe-input fe-textarea ${ctx.invalid ? 'fe-invalid' : ''}"
            id=${id}
            rows="4"
            maxlength=${maxLength ?? nothing}
            .defaultValue=${typeof ctx.value === 'string' ? ctx.value : ''}
            ?disabled=${ctx.disabled}
            ?required=${ctx.required}
            aria-invalid=${ctx.invalid ? 'true' : 'false'}
            aria-describedby=${describedBy(ctx)}
            @input=${onInput}
          ></textarea>`
        : html`<input
            class="fe-input ${size === 'SMALL' ? 'fe-input-small' : ''} ${ctx.invalid ? 'fe-invalid' : ''}"
            id=${id}
            type="text"
            maxlength=${maxLength ?? nothing}
            .defaultValue=${typeof ctx.value === 'string' ? ctx.value : ''}
            ?disabled=${ctx.disabled}
            ?required=${ctx.required}
            aria-invalid=${ctx.invalid ? 'true' : 'false'}
            aria-describedby=${describedBy(ctx)}
            @input=${onInput}
          />`}
      ${maxLength !== null
        ? html`<span class="fe-char-counter" aria-hidden="true">${length} / ${maxLength}</span>`
        : nothing}
      ${renderValidationMessage(ctx)}
    </div>
  `;
});

// ---------------------------------------------------------------------------
// RADIO — Phase 1
// ---------------------------------------------------------------------------

registerQuestionRenderer('RADIO', (ctx) => {
  const config = ctx.question.typeConfig as unknown as RadioConfig;
  const options = config?.options ?? [];
  const groupName = fieldId(ctx.question);
  return html`
    <fieldset
      class="fe-field fe-choice-group ${ctx.invalid ? 'fe-invalid' : ''}"
      aria-describedby=${describedBy(ctx)}
      aria-invalid=${ctx.invalid ? 'true' : 'false'}
    >
      ${renderLegend(ctx)}
      ${options.map(
        (option) => html`
          <label class="fe-choice-option">
            <input
              type="radio"
              name=${groupName}
              value=${option.label}
              .checked=${ctx.value === option.label}
              ?disabled=${ctx.disabled}
              @change=${() => ctx.onChange(option.label)}
            />
            <span>${option.label}</span>
          </label>
        `,
      )}
      ${renderValidationMessage(ctx)}
    </fieldset>
  `;
});

// ---------------------------------------------------------------------------
// CHECKBOX — §6.2: array answer in option order, maxSelections hint
// ---------------------------------------------------------------------------

registerQuestionRenderer('CHECKBOX', (ctx) => {
  const config = ctx.question.typeConfig as unknown as CheckboxConfig;
  const options = config?.options ?? [];
  const max = typeof config?.maxSelections === 'number' ? config.maxSelections : null;
  const selected: string[] = Array.isArray(ctx.value)
    ? ctx.value.filter((v): v is string => typeof v === 'string')
    : [];
  const maxReached = max !== null && selected.length >= max;
  const toggle = (label: string) => {
    const chosen = new Set(selected);
    if (chosen.has(label)) {
      chosen.delete(label);
    } else {
      chosen.add(label);
    }
    // Selected labels are stored in option order (§3); no empty arrays (FR2-4).
    const next = options.map((o) => o.label).filter((l) => chosen.has(l));
    ctx.onChange(next.length > 0 ? next : undefined);
  };
  return html`
    <fieldset
      class="fe-field fe-choice-group ${ctx.invalid ? 'fe-invalid' : ''}"
      aria-describedby=${describedBy(ctx)}
      aria-invalid=${ctx.invalid ? 'true' : 'false'}
    >
      ${renderLegend(ctx)}
      ${max !== null
        ? html`<p class="fe-hint">${(ctx.labels ?? defaultMessages)('checkboxMaxHint', { n: max })}</p>`
        : nothing}
      ${options.map((option) => {
        const checked = selected.includes(option.label);
        return html`
          <label class="fe-choice-option ${maxReached && !checked ? 'fe-choice-disabled' : ''}">
            <input
              type="checkbox"
              value=${option.label}
              .checked=${checked}
              ?disabled=${ctx.disabled || (maxReached && !checked)}
              @change=${() => toggle(option.label)}
            />
            <span>${option.label}</span>
          </label>
        `;
      })}
      ${renderValidationMessage(ctx)}
    </fieldset>
  `;
});

// ---------------------------------------------------------------------------
// DROPDOWN — §6.3: searchable single-select with clear affordance
// ---------------------------------------------------------------------------

registerQuestionRenderer('DROPDOWN', (ctx) => {
  const config = ctx.question.typeConfig as unknown as DropdownConfig;
  const options = (config?.options ?? []).map((o) => ({ value: o.label, label: o.label }));
  const id = fieldId(ctx.question);
  return html`
    <div class="fe-field" aria-describedby=${describedBy(ctx)}>
      ${renderLabel(ctx, id)}
      <fe-select
        select-id=${id}
        .options=${options}
        .value=${typeof ctx.value === 'string' ? ctx.value : null}
        .clearable=${true}
        .invalid=${ctx.invalid}
        .messages=${ctx.labels ?? null}
        .placeholder=${(ctx.labels ?? defaultMessages)('dropdownPlaceholder')}
        search-label=${(ctx.labels ?? defaultMessages)('dropdownSearchLabel')}
        ?disabled=${ctx.disabled}
        @fe-change=${(e: CustomEvent<{ value: string | null }>) =>
          ctx.onChange(e.detail.value ?? undefined)}
      ></fe-select>
      ${renderValidationMessage(ctx)}
    </div>
  `;
});

// ---------------------------------------------------------------------------
// DATE — §6.4
// ---------------------------------------------------------------------------

registerQuestionRenderer('DATE', (ctx) => {
  const config = ctx.question.typeConfig as unknown as DateConfig;
  const id = fieldId(ctx.question);
  return html`
    <div class="fe-field" aria-describedby=${describedBy(ctx)}>
      ${renderLabel(ctx, id)}
      <fe-date-input
        input-id=${id}
        .value=${typeof ctx.value === 'string' ? ctx.value : null}
        .minDate=${config?.minDate ?? null}
        .maxDate=${config?.maxDate ?? null}
        .disallowPast=${config?.disallowPast === true}
        .disallowFuture=${config?.disallowFuture === true}
        .invalid=${ctx.invalid}
        .messages=${ctx.labels ?? null}
        ?disabled=${ctx.disabled}
        @fe-change=${(e: CustomEvent<{ value: string | null }>) =>
          ctx.onChange(e.detail.value ?? undefined)}
        @fe-input-error=${(e: CustomEvent<{ message: string | null }>) =>
          ctx.onFieldError(e.detail.message)}
      ></fe-date-input>
      ${renderValidationMessage(ctx)}
    </div>
  `;
});

// ---------------------------------------------------------------------------
// NUMBER — §6.5: numeric input, cosmetic adornment, decimals on blur
// ---------------------------------------------------------------------------

registerQuestionRenderer('NUMBER', (ctx) => {
  const config = ctx.question.typeConfig as unknown as NumberConfig;
  const id = fieldId(ctx.question);
  const adornment = config?.adornment ?? 'NONE';
  const prefix = adornment === 'CURRENCY' ? (config?.currencySymbol || '$') : null;
  const suffix = adornment === 'PERCENT' ? '%' : null;
  const decimalPlaces = typeof config?.decimalPlaces === 'number' ? config.decimalPlaces : null;

  const onInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    // Reject non-numeric entry (§6.5): permit digits, sign, decimal point.
    const cleaned = input.value.replace(/[^0-9.\-]/g, '');
    if (cleaned !== input.value) {
      input.value = cleaned;
    }
    if (cleaned.trim() === '') {
      ctx.onFieldError(null);
      ctx.onChange(undefined);
      return;
    }
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      ctx.onFieldError(null);
      ctx.onChange(parsed);
    } else {
      // Partial entry like "-" or "1.": no answer yet; error surfaces on blur.
      ctx.onChange(undefined);
    }
  };
  const onBlur = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const raw = input.value.trim();
    if (raw === '') {
      ctx.onFieldError(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      ctx.onFieldError((ctx.labels ?? defaultMessages)('numberInvalidError'));
      return;
    }
    ctx.onFieldError(null);
    if (decimalPlaces !== null) {
      const factor = 10 ** decimalPlaces;
      const rounded = Math.round(parsed * factor) / factor;
      if (rounded !== parsed) {
        input.value = String(rounded);
        ctx.onChange(rounded);
      }
    }
  };

  return html`
    <div class="fe-field">
      ${renderLabel(ctx, id)}
      <div class="fe-adorned ${ctx.invalid ? 'fe-invalid' : ''}">
        ${prefix ? html`<span class="fe-adornment" aria-hidden="true">${prefix}</span>` : nothing}
        <input
          class="fe-input"
          id=${id}
          type="text"
          inputmode="decimal"
          autocomplete="off"
          .defaultValue=${typeof ctx.value === 'number' ? String(ctx.value) : ''}
          ?disabled=${ctx.disabled}
          ?required=${ctx.required}
          aria-invalid=${ctx.invalid ? 'true' : 'false'}
          aria-describedby=${describedBy(ctx)}
          @input=${onInput}
          @blur=${onBlur}
        />
        ${suffix ? html`<span class="fe-adornment" aria-hidden="true">${suffix}</span>` : nothing}
      </div>
      ${renderValidationMessage(ctx)}
    </div>
  `;
});

// ---------------------------------------------------------------------------
// EMAIL / PHONE — §6.6
// ---------------------------------------------------------------------------

function textInputRenderer(inputMode: 'email' | 'tel'): QuestionRenderer {
  return (ctx) => {
    const id = fieldId(ctx.question);
    return html`
      <div class="fe-field">
        ${renderLabel(ctx, id)}
        <input
          class="fe-input ${ctx.invalid ? 'fe-invalid' : ''}"
          id=${id}
          type="text"
          inputmode=${inputMode}
          autocomplete=${inputMode === 'email' ? 'email' : 'tel'}
          .defaultValue=${typeof ctx.value === 'string' ? ctx.value : ''}
          ?disabled=${ctx.disabled}
          ?required=${ctx.required}
          aria-invalid=${ctx.invalid ? 'true' : 'false'}
          aria-describedby=${describedBy(ctx)}
          @input=${(e: Event) => ctx.onChange(normalizeText((e.target as HTMLInputElement).value))}
        />
        ${renderValidationMessage(ctx)}
      </div>
    `;
  };
}

registerQuestionRenderer('EMAIL', textInputRenderer('email'));
registerQuestionRenderer('PHONE', textInputRenderer('tel'));

// ---------------------------------------------------------------------------
// TOGGLE — §6.7: segmented control, no default state, no way back (P2-D4)
// ---------------------------------------------------------------------------

registerQuestionRenderer('TOGGLE', (ctx) => {
  const config = ctx.question.typeConfig as unknown as ToggleConfig;
  const trueLabel = config?.trueLabel || 'Yes';
  const falseLabel = config?.falseLabel || 'No';
  const id = fieldId(ctx.question);
  const button = (label: string, target: boolean) => html`
    <button
      type="button"
      class="fe-toggle-option ${ctx.value === target ? 'fe-selected' : ''}"
      aria-pressed=${ctx.value === target ? 'true' : 'false'}
      ?disabled=${ctx.disabled}
      @click=${() => ctx.onChange(target)}
    >
      ${label}
    </button>
  `;
  return html`
    <div class="fe-field" role="group" aria-labelledby=${`${id}-label`} aria-describedby=${describedBy(ctx)}>
      <span class="fe-label" id=${`${id}-label`}>
        ${ctx.question.prompt}${ctx.required
          ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
          : nothing}
      </span>
      <div class="fe-toggle ${ctx.invalid ? 'fe-invalid' : ''}">
        ${button(trueLabel, true)} ${button(falseLabel, false)}
      </div>
      ${renderValidationMessage(ctx)}
    </div>
  `;
});

// ---------------------------------------------------------------------------
// ADDRESS — §6.8
// ---------------------------------------------------------------------------

registerQuestionRenderer('ADDRESS', (ctx) => {
  const value =
    typeof ctx.value === 'object' && ctx.value !== null && !Array.isArray(ctx.value)
      ? (ctx.value as Record<string, string>)
      : null;
  return html`
    <fieldset
      class="fe-field fe-address-group ${ctx.invalid ? 'fe-invalid' : ''}"
      aria-describedby=${describedBy(ctx)}
      aria-invalid=${ctx.invalid ? 'true' : 'false'}
    >
      ${renderLegend(ctx)}
      <fe-address
        group-id=${fieldId(ctx.question)}
        .value=${value}
        .config=${ctx.question.typeConfig ?? {}}
        .geocode=${ctx.geocode ?? null}
        .invalid=${ctx.invalid}
        .messages=${ctx.labels ?? null}
        ?disabled=${ctx.disabled}
        @fe-change=${(e: CustomEvent<{ value: Record<string, string> | null }>) =>
          ctx.onChange(e.detail.value ?? undefined)}
      ></fe-address>
      ${renderValidationMessage(ctx)}
    </fieldset>
  `;
});

// ---------------------------------------------------------------------------
// FILE_UPLOAD — Phase 3 §5.3: immediate-upload dropzone, array answer
// ---------------------------------------------------------------------------

registerQuestionRenderer('FILE_UPLOAD', (ctx) => {
  const id = fieldId(ctx.question);
  const value =
    Array.isArray(ctx.value) && ctx.value.every((v) => typeof v === 'object' && v !== null)
      ? (ctx.value as FileReference[])
      : null;
  return html`
    <div class="fe-field" role="group" aria-labelledby=${`${id}-label`} aria-describedby=${describedBy(ctx)}>
      <span class="fe-label" id=${`${id}-label`}>
        ${ctx.question.prompt}${ctx.required
          ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
          : nothing}
      </span>
      <fe-upload
        group-id=${id}
        .value=${value}
        .config=${ctx.question.typeConfig ?? {}}
        .uploads=${ctx.uploads ?? null}
        .invalid=${ctx.invalid}
        .messages=${ctx.labels ?? null}
        ?disabled=${ctx.disabled}
        @fe-change=${(e: CustomEvent<{ value: FileReference[] | null }>) =>
          ctx.onChange(e.detail.value ?? undefined)}
        @fe-busy-change=${(e: CustomEvent<{ count: number }>) => ctx.onUploadBusy?.(e.detail.count)}
      ></fe-upload>
      ${renderValidationMessage(ctx)}
    </div>
  `;
});

// ---------------------------------------------------------------------------
// DISPLAY_BLOCK — §6.9: sanitized content, no input, no label
// ---------------------------------------------------------------------------

registerQuestionRenderer('DISPLAY_BLOCK', (ctx) => {
  const config = ctx.question.typeConfig as unknown as DisplayBlockConfig;
  return html`<div class="fe-display-block">${unsafeHTML(renderMarkdown(config?.content ?? ''))}</div>`;
});
