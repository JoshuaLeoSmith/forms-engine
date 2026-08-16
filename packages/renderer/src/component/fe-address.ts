/**
 * <fe-address> — internal grouped address control (Phase 2 §6.8). One
 * question rendering country/line1/line2/city/state/postalCode sub-fields,
 * answering as one flat string object. US gets "bells and whistles" (state
 * dropdown of codes, ZIP validation); every other country gets free-text
 * state/postal (per-country behavior is confined to this module, §6.8.2).
 * Switching country clears state only. line1 offers geocode autocomplete via
 * the injected callback — an accelerator, never a gate (§6.8.4).
 *
 * Events: fe-change {value: Record<string,string>|null} (null = fully empty,
 * FR2-4).
 */
import { html, LitElement, nothing, type TemplateResult } from 'lit';
import {
  addressEnabledFields,
  addressRequiredFields,
  type AddressConfig,
  type AddressSubField,
} from '../core/registry.js';
import { COUNTRIES } from '../core/data/countries.js';
import { US_STATES, usStateCodeFromName } from '../core/data/us-states.js';
import { defaultMessages, type LabelKey, type MessageResolver } from '../core/labels.js';
import type { GeocodeSuggestion } from '../api/client.js';
import { defineFeSelect, type FeSelectOption } from './fe-select.js';

defineFeSelect();

const COUNTRY_OPTIONS: FeSelectOption[] = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));
const STATE_OPTIONS: FeSelectOption[] = US_STATES.map((s) => ({ value: s.code, label: s.name }));

const FIELD_LABEL_KEYS: Record<AddressSubField, LabelKey> = {
  country: 'addressCountry',
  line1: 'addressLine1',
  line2: 'addressLine2',
  city: 'addressCity',
  state: 'addressState',
  postalCode: 'addressPostalCode',
};

export type GeocodeFn = (query: string, country?: string) => Promise<GeocodeSuggestion[]>;

export class FeAddressElement extends LitElement {
  static override properties = {
    value: { attribute: false },
    config: { attribute: false },
    geocode: { attribute: false },
    messages: { attribute: false },
    disabled: { type: Boolean },
    invalid: { type: Boolean },
    groupId: { type: String, attribute: 'group-id' },
    _suggestions: { state: true },
    _suggestionsOpen: { state: true },
    _activeSuggestion: { state: true },
  };

  value: Record<string, string> | null = null;
  config: Record<string, unknown> = {};
  geocode: GeocodeFn | null = null;
  /** Host-resolved strings (FR4-13); null = English defaults. */
  messages: MessageResolver | null = null;
  disabled = false;
  invalid = false;
  groupId = 'fe-addr';

  private msg(key: LabelKey, params?: Record<string, string | number>): string {
    return (this.messages ?? defaultMessages)(key, params);
  }

  private _suggestions: GeocodeSuggestion[] = [];
  private _suggestionsOpen = false;
  private _activeSuggestion = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    super.disconnectedCallback();
  }

  private get addressConfig(): AddressConfig {
    return this.config as unknown as AddressConfig;
  }

  private enabled(): AddressSubField[] {
    return addressEnabledFields(this.config);
  }

  private requiredSet(): ReadonlySet<AddressSubField> {
    return new Set(addressRequiredFields(this.config));
  }

  /** Current object including untouched-enabled fields as '' (§6.8.3). */
  private current(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const field of this.enabled()) {
      result[field] = this.value?.[field] ?? '';
    }
    // Pre-select the default country while the address is untouched; it only
    // becomes part of the stored answer once any field is actually filled.
    if (this.value === null && typeof this.addressConfig.defaultCountry === 'string') {
      result['country'] = this.addressConfig.defaultCountry;
    }
    return result;
  }

  private emitValue(next: Record<string, string>): void {
    const allEmpty = Object.values(next).every((v) => v.trim() === '');
    const value = allEmpty ? null : next;
    this.value = value;
    this.dispatchEvent(new CustomEvent('fe-change', { detail: { value }, bubbles: false }));
  }

  private setField(field: AddressSubField, raw: string): void {
    const next = { ...this.current(), [field]: raw };
    if (field === 'country' && raw !== this.current()['country']) {
      // A stored state code is meaningless under another country (§6.8.2);
      // everything else is preserved.
      if (this.enabled().includes('state')) {
        next['state'] = '';
      }
    }
    this.emitValue(next);
  }

  // ---- autocomplete (§6.8.4) ----------------------------------------------

  private onLine1Input(raw: string): void {
    this.setField('line1', raw);
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const query = raw.trim();
    if (!this.geocode || this.addressConfig.autocomplete === false || query.length < 3) {
      this.closeSuggestions();
      return;
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const seq = ++this.requestSeq;
      const country = this.current()['country'] || undefined;
      this.geocode!(query, country)
        .then((suggestions) => {
          if (seq !== this.requestSeq) {
            return; // superseded
          }
          this._suggestions = suggestions;
          this._suggestionsOpen = suggestions.length > 0;
          this._activeSuggestion = 0;
        })
        .catch(() => {
          // Autocomplete failing never impedes manual entry (§6.8.4).
          this.closeSuggestions();
        });
    }, 300);
  }

  private closeSuggestions(): void {
    this._suggestionsOpen = false;
    this._suggestions = [];
  }

  private applySuggestion(suggestion: GeocodeSuggestion): void {
    const enabled = this.enabled();
    const next = this.current();
    const fill = (field: AddressSubField, value: string) => {
      if (value && enabled.includes(field)) {
        next[field] = value;
      }
    };
    fill('line1', suggestion.line1);
    fill('city', suggestion.city);
    fill('postalCode', suggestion.postalCode);
    fill('country', suggestion.country);
    if (suggestion.state) {
      const code =
        (suggestion.country || next['country']) === 'US'
          ? (usStateCodeFromName(suggestion.state) ?? suggestion.state)
          : suggestion.state;
      fill('state', code);
    }
    this.closeSuggestions();
    this.emitValue(next);
  }

  private onLine1Keydown(event: KeyboardEvent): void {
    if (!this._suggestionsOpen) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._activeSuggestion = Math.min(this._activeSuggestion + 1, this._suggestions.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._activeSuggestion = Math.max(this._activeSuggestion - 1, 0);
        break;
      case 'Enter': {
        event.preventDefault();
        const chosen = this._suggestions[this._activeSuggestion];
        if (chosen) {
          this.applySuggestion(chosen);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.closeSuggestions();
        break;
    }
  }

  // ---- rendering -----------------------------------------------------------

  private renderTextField(field: AddressSubField, current: Record<string, string>, half: boolean): TemplateResult {
    const id = `${this.groupId}-${field}`;
    const required = this.requiredSet().has(field);
    return html`
      <div class="fe-addr-field ${half ? 'fe-addr-half' : ''}">
        <label class="fe-sublabel" for=${id}>
          ${this.msg(FIELD_LABEL_KEYS[field])}${required
            ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
            : nothing}
        </label>
        <input
          class="fe-input"
          id=${id}
          type="text"
          autocomplete="off"
          .value=${current[field] ?? ''}
          ?disabled=${this.disabled}
          @input=${(e: Event) => this.setField(field, (e.target as HTMLInputElement).value)}
        />
      </div>
    `;
  }

  override render(): TemplateResult {
    const current = this.current();
    const enabled = this.enabled();
    const required = this.requiredSet();
    const isUS = current['country'] === 'US';
    const line1Id = `${this.groupId}-line1`;
    const listboxId = `${this.groupId}-suggestions`;
    return html`
      <div class="fe-address">
        <div class="fe-addr-field">
          <label class="fe-sublabel" id=${`${this.groupId}-country-label`} for=${`${this.groupId}-country`}>
            ${this.msg('addressCountry')}${required.has('country')
              ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
              : nothing}
          </label>
          <fe-select
            select-id=${`${this.groupId}-country`}
            search-label=${this.msg('addressCountrySearchLabel')}
            .options=${COUNTRY_OPTIONS}
            .value=${current['country'] || null}
            .placeholder=${this.msg('addressCountryPlaceholder')}
            .messages=${this.messages}
            ?disabled=${this.disabled}
            @fe-change=${(e: CustomEvent<{ value: string | null }>) =>
              this.setField('country', e.detail.value ?? '')}
          ></fe-select>
        </div>

        <div class="fe-addr-field fe-addr-line1">
          <label class="fe-sublabel" for=${line1Id}>
            ${this.msg('addressLine1')}${required.has('line1')
              ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
              : nothing}
          </label>
          <input
            class="fe-input"
            id=${line1Id}
            type="text"
            autocomplete="off"
            role="combobox"
            aria-expanded=${this._suggestionsOpen ? 'true' : 'false'}
            aria-controls=${this._suggestionsOpen ? listboxId : nothing}
            aria-autocomplete="list"
            .value=${current['line1'] ?? ''}
            ?disabled=${this.disabled}
            @input=${(e: Event) => this.onLine1Input((e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => this.onLine1Keydown(e)}
            @blur=${() => setTimeout(() => this.closeSuggestions(), 150)}
          />
          ${this._suggestionsOpen
            ? html`
                <ul class="fe-suggestions" role="listbox" id=${listboxId}>
                  ${this._suggestions.map(
                    (s, i) => html`
                      <li
                        class="fe-suggestion ${i === this._activeSuggestion ? 'fe-active' : ''}"
                        role="option"
                        aria-selected=${i === this._activeSuggestion ? 'true' : 'false'}
                        @pointerenter=${() => (this._activeSuggestion = i)}
                        @pointerdown=${(e: Event) => {
                          e.preventDefault();
                          this.applySuggestion(s);
                        }}
                      >
                        ${s.label}
                      </li>
                    `,
                  )}
                </ul>
              `
            : nothing}
        </div>

        <div class="fe-addr-grid">
          ${enabled.includes('line2') ? this.renderTextField('line2', current, true) : nothing}
          ${this.renderTextField('city', current, true)}
          ${enabled.includes('state')
            ? isUS
              ? html`
                  <div class="fe-addr-field fe-addr-half">
                    <label class="fe-sublabel" for=${`${this.groupId}-state`}>
                      ${this.msg('addressStateUs')}${required.has('state')
                        ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
                        : nothing}
                    </label>
                    <fe-select
                      select-id=${`${this.groupId}-state`}
                      search-label=${this.msg('addressStateSearchLabel')}
                      .options=${STATE_OPTIONS}
                      .value=${current['state'] || null}
                      .placeholder=${this.msg('addressStatePlaceholder')}
                      .messages=${this.messages}
                      .clearable=${true}
                      ?disabled=${this.disabled}
                      @fe-change=${(e: CustomEvent<{ value: string | null }>) =>
                        this.setField('state', e.detail.value ?? '')}
                    ></fe-select>
                  </div>
                `
              : this.renderTextField('state', current, true)
            : nothing}
          ${enabled.includes('postalCode')
            ? html`
                <div class="fe-addr-field fe-addr-half">
                  <label class="fe-sublabel" for=${`${this.groupId}-postalCode`}>
                    ${isUS ? this.msg('addressZipCode') : this.msg('addressPostalCode')}${required.has('postalCode')
                      ? html`<span class="fe-required-marker" aria-hidden="true">*</span>`
                      : nothing}
                  </label>
                  <input
                    class="fe-input"
                    id=${`${this.groupId}-postalCode`}
                    type="text"
                    autocomplete="off"
                    .value=${current['postalCode'] ?? ''}
                    ?disabled=${this.disabled}
                    @input=${(e: Event) =>
                      this.setField('postalCode', (e.target as HTMLInputElement).value)}
                  />
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }
}

export function defineFeAddress(): void {
  if (!customElements.get('fe-address')) {
    customElements.define('fe-address', FeAddressElement);
  }
}
