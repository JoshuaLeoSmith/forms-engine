/**
 * <fe-select> — internal searchable single-select control (Phase 2 §6.3),
 * used by DROPDOWN questions and by ADDRESS country/state fields. Renders in
 * light DOM so the <forms-engine> shadow stylesheet applies. Combobox/listbox
 * semantics, fully keyboard-operable (NFR2-3): arrows, Enter, Escape; the
 * filter is client-side case-insensitive substring match and clears on close.
 */
import { html, LitElement, nothing, type TemplateResult } from 'lit';
import { defaultMessages, type LabelKey, type MessageResolver } from '../core/labels.js';

export interface FeSelectOption {
  value: string;
  label: string;
}

export class FeSelectElement extends LitElement {
  static override properties = {
    options: { attribute: false },
    value: { attribute: false },
    placeholder: { type: String },
    messages: { attribute: false },
    disabled: { type: Boolean },
    clearable: { type: Boolean },
    invalid: { type: Boolean },
    selectId: { type: String, attribute: 'select-id' },
    searchLabel: { type: String, attribute: 'search-label' },
    _open: { state: true },
    _filter: { state: true },
    _active: { state: true },
  };

  options: FeSelectOption[] = [];
  value: string | null = null;
  placeholder = 'Select…';
  /** Host-resolved strings (FR4-13); null = English defaults. */
  messages: MessageResolver | null = null;
  disabled = false;
  clearable = false;
  invalid = false;
  selectId = '';
  searchLabel = 'Search options';

  private msg(key: LabelKey, params?: Record<string, string | number>): string {
    return (this.messages ?? defaultMessages)(key, params);
  }

  private _open = false;
  private _filter = '';
  private _active = 0;

  private readonly onDocumentPointerDown = (event: Event) => {
    if (!event.composedPath().includes(this)) {
      this.close(false);
    }
  };

  /** Light DOM: styled by the host component's shadow stylesheet. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    super.disconnectedCallback();
  }

  private filtered(): FeSelectOption[] {
    const needle = this._filter.trim().toLowerCase();
    if (!needle) {
      return this.options;
    }
    return this.options.filter((o) => o.label.toLowerCase().includes(needle));
  }

  private openPopup(): void {
    if (this.disabled || this._open) {
      return;
    }
    this._open = true;
    this._filter = '';
    const idx = this.options.findIndex((o) => o.value === this.value);
    this._active = idx >= 0 ? idx : 0;
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    void this.updateComplete.then(() => {
      this.querySelector<HTMLInputElement>('.fe-select-search')?.focus();
    });
  }

  private close(refocus: boolean): void {
    if (!this._open) {
      return;
    }
    this._open = false;
    this._filter = '';
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    if (refocus) {
      void this.updateComplete.then(() => {
        this.querySelector<HTMLButtonElement>('.fe-select-trigger')?.focus();
      });
    }
  }

  private commit(value: string | null): void {
    this.value = value;
    this.dispatchEvent(new CustomEvent('fe-change', { detail: { value }, bubbles: false }));
    this.close(true);
  }

  private onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.openPopup();
    }
  }

  private onSearchKeydown(event: KeyboardEvent): void {
    const options = this.filtered();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._active = Math.min(this._active + 1, options.length - 1);
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._active = Math.max(this._active - 1, 0);
        this.scrollActiveIntoView();
        break;
      case 'Enter': {
        event.preventDefault();
        const chosen = options[this._active];
        if (chosen) {
          this.commit(chosen.value);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  private scrollActiveIntoView(): void {
    void this.updateComplete.then(() => {
      this.querySelector('.fe-select-option.fe-active')?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  override render(): TemplateResult {
    const selected = this.options.find((o) => o.value === this.value);
    const options = this.filtered();
    const listboxId = `${this.selectId || 'fe-select'}-listbox`;
    return html`
      <div class="fe-select ${this._open ? 'fe-open' : ''}">
        <button
          type="button"
          class="fe-input fe-select-trigger ${this.invalid ? 'fe-invalid' : ''} ${selected ? '' : 'fe-placeholder'}"
          id=${this.selectId || nothing}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded=${this._open ? 'true' : 'false'}
          aria-controls=${this._open ? listboxId : nothing}
          ?disabled=${this.disabled}
          @click=${() => (this._open ? this.close(true) : this.openPopup())}
          @keydown=${(e: KeyboardEvent) => this.onTriggerKeydown(e)}
        >
          <span class="fe-select-value">${selected ? selected.label : this.placeholder}</span>
          <span class="fe-select-caret" aria-hidden="true">▾</span>
        </button>
        ${this.clearable && selected && !this.disabled
          ? html`<button
              type="button"
              class="fe-select-clear"
              aria-label=${this.msg('dropdownClearLabel')}
              @click=${() => this.commit(null)}
            >
              ×
            </button>`
          : nothing}
        ${this._open
          ? html`
              <div class="fe-select-popup">
                <input
                  class="fe-input fe-select-search"
                  type="text"
                  role="searchbox"
                  aria-label=${this.searchLabel}
                  placeholder=${this.msg('dropdownSearchPlaceholder')}
                  .value=${this._filter}
                  @input=${(e: Event) => {
                    this._filter = (e.target as HTMLInputElement).value;
                    this._active = 0;
                  }}
                  @keydown=${(e: KeyboardEvent) => this.onSearchKeydown(e)}
                />
                <ul class="fe-select-options" role="listbox" id=${listboxId}>
                  ${options.length === 0
                    ? html`<li class="fe-select-empty" role="presentation">${this.msg('dropdownNoMatches')}</li>`
                    : options.map(
                        (option, i) => html`
                          <li
                            class="fe-select-option ${i === this._active ? 'fe-active' : ''}"
                            role="option"
                            aria-selected=${option.value === this.value ? 'true' : 'false'}
                            @pointerenter=${() => (this._active = i)}
                            @click=${() => this.commit(option.value)}
                          >
                            ${option.label}
                          </li>
                        `,
                      )}
                </ul>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

export function defineFeSelect(): void {
  if (!customElements.get('fe-select')) {
    customElements.define('fe-select', FeSelectElement);
  }
}
