/**
 * <fe-date-input> — internal date control (Phase 2 §6.4): a text field
 * accepting manual `YYYY-MM-DD` / `MM/DD/YYYY` entry plus a hand-rolled popup
 * calendar (no date library, NFR2-1). Fully keyboard-operable (NFR2-3):
 * arrows move a day, PageUp/PageDown a month, Enter selects, Escape closes.
 * All range math is ISO-string comparison (§4.3); the platform clock is only
 * used for the respondent's local "today".
 *
 * Events: fe-change {value: string|null} on a valid parse or clear;
 * fe-input-error {message: string|null} for unparseable text that never
 * becomes an answer but must still block navigation (§6.4).
 */
import { html, LitElement, nothing, type TemplateResult } from 'lit';
import {
  dayOfWeek,
  daysInMonth,
  isValidIsoDate,
  localToday,
  parseDateInput,
  parseIsoDate,
  toIsoDate,
} from '../core/dates.js';
import { defaultMessages, type LabelKey, type MessageResolver } from '../core/labels.js';

export class FeDateInputElement extends LitElement {
  static override properties = {
    value: { attribute: false },
    minDate: { attribute: false },
    maxDate: { attribute: false },
    disallowPast: { type: Boolean, attribute: false },
    disallowFuture: { type: Boolean, attribute: false },
    messages: { attribute: false },
    disabled: { type: Boolean },
    invalid: { type: Boolean },
    inputId: { type: String, attribute: 'input-id' },
    _open: { state: true },
    _text: { state: true },
    _viewYear: { state: true },
    _viewMonth: { state: true },
    _focusDay: { state: true },
  };

  value: string | null = null;
  minDate: string | null = null;
  maxDate: string | null = null;
  disallowPast = false;
  disallowFuture = false;
  /** Host-resolved strings (FR4-13); null = English defaults. */
  messages: MessageResolver | null = null;
  disabled = false;
  invalid = false;
  inputId = '';

  private msg(key: LabelKey, params?: Record<string, string | number>): string {
    return (this.messages ?? defaultMessages)(key, params);
  }

  /** Comma-separated label keys keep month/weekday names overridable (FR4-13). */
  private monthNames(): string[] {
    return this.msg('dateMonthNames').split(',');
  }

  private weekdayNames(): string[] {
    return this.msg('dateWeekdayNames').split(',');
  }

  private _open = false;
  private _text = '';
  private _viewYear = 0;
  private _viewMonth = 0;
  private _focusDay = 1;
  private lastSyncedValue: string | null | undefined = undefined;

  private readonly onDocumentPointerDown = (event: Event) => {
    if (!event.composedPath().includes(this)) {
      this.closePopup(false);
    }
  };

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override willUpdate(): void {
    // Sync the text field when the stored value changes from outside
    // (rule-driven clearing, autofill from a suggestion).
    if (this.value !== this.lastSyncedValue) {
      this.lastSyncedValue = this.value;
      this._text = this.value ?? '';
    }
  }

  override disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    super.disconnectedCallback();
  }

  /** Effective bounds: min/max plus today-relative flags (§6.4). */
  private bounds(): { min: string | null; max: string | null } {
    const today = localToday();
    let min = this.minDate;
    let max = this.maxDate;
    if (this.disallowPast && (min === null || today > min)) {
      min = today;
    }
    if (this.disallowFuture && (max === null || today < max)) {
      max = today;
    }
    return { min, max };
  }

  private inRange(iso: string): boolean {
    const { min, max } = this.bounds();
    return (min === null || iso >= min) && (max === null || iso <= max);
  }

  private emitChange(value: string | null): void {
    this.value = value;
    this.lastSyncedValue = value;
    this.dispatchEvent(new CustomEvent('fe-change', { detail: { value }, bubbles: false }));
  }

  private emitInputError(message: string | null): void {
    this.dispatchEvent(new CustomEvent('fe-input-error', { detail: { message }, bubbles: false }));
  }

  /** Manual entry parse on blur/Enter (§6.4). */
  private commitText(): void {
    const text = this._text.trim();
    if (text.length === 0) {
      this.emitInputError(null);
      this.emitChange(null);
      return;
    }
    const iso = parseDateInput(text);
    if (iso === null) {
      // Unparseable input never becomes an answer but blocks navigation.
      this.emitInputError(this.msg('formatErrorDate'));
      return;
    }
    this._text = iso;
    this.emitInputError(null);
    // Out-of-range values ARE stored; the type's validateAnswer blocks
    // navigation with the specific range message.
    this.emitChange(iso);
  }

  private openPopup(): void {
    if (this.disabled || this._open) {
      return;
    }
    const base = isValidIsoDate(this.value ?? '') ? this.value! : localToday();
    const { year, month, day } = parseIsoDate(base);
    this._viewYear = year;
    this._viewMonth = month;
    this._focusDay = day;
    this._open = true;
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    void this.updateComplete.then(() => {
      this.querySelector<HTMLButtonElement>('.fe-cal-day.fe-focus')?.focus();
    });
  }

  private closePopup(refocus: boolean): void {
    if (!this._open) {
      return;
    }
    this._open = false;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    if (refocus) {
      void this.updateComplete.then(() => {
        this.querySelector<HTMLButtonElement>('.fe-date-toggle')?.focus();
      });
    }
  }

  private shiftMonth(delta: number): void {
    let month = this._viewMonth + delta;
    let year = this._viewYear;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    this._viewYear = year;
    this._viewMonth = month;
    this._focusDay = Math.min(this._focusDay, daysInMonth(year, month));
  }

  private moveFocus(deltaDays: number): void {
    let day = this._focusDay + deltaDays;
    while (day < 1) {
      this.shiftMonth(-1);
      day += daysInMonth(this._viewYear, this._viewMonth);
    }
    while (day > daysInMonth(this._viewYear, this._viewMonth)) {
      day -= daysInMonth(this._viewYear, this._viewMonth);
      this.shiftMonth(1);
    }
    this._focusDay = day;
    void this.updateComplete.then(() => {
      this.querySelector<HTMLButtonElement>('.fe-cal-day.fe-focus')?.focus();
    });
  }

  private onGridKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.moveFocus(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveFocus(-7);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveFocus(7);
        break;
      case 'PageUp':
        event.preventDefault();
        this.shiftMonth(-1);
        break;
      case 'PageDown':
        event.preventDefault();
        this.shiftMonth(1);
        break;
      case 'Escape':
        event.preventDefault();
        this.closePopup(true);
        break;
    }
  }

  private selectDay(day: number): void {
    const iso = toIsoDate(this._viewYear, this._viewMonth, day);
    if (!this.inRange(iso)) {
      return;
    }
    this._text = iso;
    this.emitInputError(null);
    this.emitChange(iso);
    this.closePopup(true);
  }

  private renderCalendar(): TemplateResult {
    const year = this._viewYear;
    const month = this._viewMonth;
    const firstDow = dayOfWeek(year, month, 1);
    const total = daysInMonth(year, month);
    const today = localToday();
    const cells: (number | null)[] = [
      ...Array.from({ length: firstDow }, () => null),
      ...Array.from({ length: total }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return html`
      <div class="fe-cal" role="dialog" aria-label=${this.msg('dateDialogLabel')} @keydown=${(e: KeyboardEvent) => this.onGridKeydown(e)}>
        <div class="fe-cal-header">
          <button type="button" class="fe-cal-nav" aria-label=${this.msg('datePrevMonthLabel')} @click=${() => this.shiftMonth(-1)}>‹</button>
          <span class="fe-cal-title" aria-live="polite">${this.monthNames()[month - 1]} ${year}</span>
          <button type="button" class="fe-cal-nav" aria-label=${this.msg('dateNextMonthLabel')} @click=${() => this.shiftMonth(1)}>›</button>
        </div>
        <table class="fe-cal-grid" role="grid">
          <thead>
            <tr>${this.weekdayNames().map((d) => html`<th scope="col" aria-label=${d}>${d}</th>`)}</tr>
          </thead>
          <tbody>
            ${weeks.map(
              (week) => html`<tr>
                ${week.map((day) => {
                  if (day === null) {
                    return html`<td></td>`;
                  }
                  const iso = toIsoDate(year, month, day);
                  const selectable = this.inRange(iso);
                  const isSelected = this.value === iso;
                  const isFocus = day === this._focusDay;
                  return html`<td>
                    <button
                      type="button"
                      class="fe-cal-day ${isSelected ? 'fe-selected' : ''} ${isFocus ? 'fe-focus' : ''} ${iso === today ? 'fe-today' : ''}"
                      tabindex=${isFocus ? '0' : '-1'}
                      aria-pressed=${isSelected ? 'true' : 'false'}
                      ?disabled=${!selectable}
                      @click=${() => this.selectDay(day)}
                      @focus=${() => (this._focusDay = day)}
                    >
                      ${day}
                    </button>
                  </td>`;
                })}
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  override render(): TemplateResult {
    return html`
      <div class="fe-date ${this._open ? 'fe-open' : ''}">
        <div class="fe-date-row">
          <input
            class="fe-input fe-date-text ${this.invalid ? 'fe-invalid' : ''}"
            id=${this.inputId || nothing}
            type="text"
            inputmode="numeric"
            placeholder=${this.msg('datePlaceholder')}
            autocomplete="off"
            .value=${this._text}
            ?disabled=${this.disabled}
            @input=${(e: Event) => (this._text = (e.target as HTMLInputElement).value)}
            @blur=${() => this.commitText()}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                this.commitText();
              }
            }}
          />
          <button
            type="button"
            class="fe-date-toggle"
            aria-label=${this.msg('dateOpenCalendarLabel')}
            aria-expanded=${this._open ? 'true' : 'false'}
            ?disabled=${this.disabled}
            @click=${() => (this._open ? this.closePopup(true) : this.openPopup())}
          >
            📅
          </button>
        </div>
        ${this._open ? this.renderCalendar() : nothing}
      </div>
    `;
  }
}

export function defineFeDateInput(): void {
  if (!customElements.get('fe-date-input')) {
    customElements.define('fe-date-input', FeDateInputElement);
  }
}
