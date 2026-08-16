import { Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  ADDRESS_ALWAYS_ENABLED,
  ADDRESS_SUB_FIELDS,
  addressEnabledFields,
  COUNTRIES,
  countryName,
  type AddressSubField,
} from '@forms-engine/renderer/core';
import type { QuestionDef } from '../../../core/models';

const FIELD_LABELS: Record<AddressSubField, string> = {
  country: 'Country',
  line1: 'Street address',
  line2: 'Address line 2',
  city: 'City',
  state: 'State / Province',
  postalCode: 'Postal code',
};

/** ADDRESS config panel (Phase 2 §6.8.1): enabled/required grid + country + autocomplete. */
@Component({
  selector: 'app-address-config',
  imports: [FormsModule, MatCheckboxModule, MatFormFieldModule, MatSelectModule, MatSlideToggleModule],
  template: `
    <div class="address-config">
      <table class="grid">
        <thead>
          <tr>
            <th>Sub-field</th>
            <th>Enabled</th>
            <th>Required</th>
          </tr>
        </thead>
        <tbody>
          @for (field of subFields; track field) {
            <tr>
              <td>{{ labels[field] }}</td>
              <td>
                <mat-checkbox
                  [checked]="isEnabled(field)"
                  [disabled]="alwaysEnabled.includes(field)"
                  (change)="setEnabled(field, $event.checked)"
                />
              </td>
              <td>
                <mat-checkbox [checked]="isRequired(field)" (change)="setRequired(field, $event.checked)" />
              </td>
            </tr>
          }
        </tbody>
      </table>
      <mat-form-field appearance="outline" class="country">
        <mat-label>Default country</mat-label>
        <mat-select [ngModel]="defaultCountry" (ngModelChange)="setDefaultCountry($event)">
          <mat-option [value]="null">None</mat-option>
          @for (country of countries; track country.code) {
            <mat-option [value]="country.code">{{ country.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle [checked]="autocomplete" (change)="setAutocomplete($event.checked)">
        Address autocomplete (geocoding)
      </mat-slide-toggle>
      <p class="hint">Required sub-fields are enabled automatically.</p>
    </div>
  `,
  styles: `
    .address-config {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .grid {
      border-collapse: collapse;
    }
    .grid th {
      font-size: 12px;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant, #5f6672);
      text-align: left;
      padding: 2px 16px 2px 0;
    }
    .grid td {
      padding: 0 16px 0 0;
      font-size: 13px;
    }
    .country {
      width: 260px;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
  `,
})
export class AddressConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();

  protected readonly subFields = ADDRESS_SUB_FIELDS;
  protected readonly alwaysEnabled = ADDRESS_ALWAYS_ENABLED;
  protected readonly labels = FIELD_LABELS;
  protected readonly countries = COUNTRIES;

  private map(key: 'enabledFields' | 'requiredFields'): Partial<Record<AddressSubField, boolean>> {
    return (this.config()[key] as Partial<Record<AddressSubField, boolean>>) ?? {};
  }

  protected isEnabled(field: AddressSubField): boolean {
    return this.alwaysEnabled.includes(field) || this.map('enabledFields')[field] === true;
  }

  protected isRequired(field: AddressSubField): boolean {
    return this.isEnabled(field) && this.map('requiredFields')[field] === true;
  }

  protected get defaultCountry(): string | null {
    const value = this.config()['defaultCountry'];
    return typeof value === 'string' ? value : null;
  }

  protected get autocomplete(): boolean {
    return this.config()['autocomplete'] !== false;
  }

  protected setEnabled(field: AddressSubField, enabled: boolean): void {
    const requiredFields = { ...this.map('requiredFields') };
    if (!enabled) {
      requiredFields[field] = false;
    }
    this.onChange()({
      ...this.config(),
      enabledFields: { ...this.map('enabledFields'), [field]: enabled },
      requiredFields,
    });
  }

  protected setRequired(field: AddressSubField, required: boolean): void {
    // Required implies enabled (§6.8.1).
    const enabledFields = { ...this.map('enabledFields') };
    if (required && !this.alwaysEnabled.includes(field)) {
      enabledFields[field] = true;
    }
    this.onChange()({
      ...this.config(),
      enabledFields,
      requiredFields: { ...this.map('requiredFields'), [field]: required },
    });
  }

  protected setDefaultCountry(code: string | null): void {
    this.onChange()({ ...this.config(), defaultCountry: code });
  }

  protected setAutocomplete(autocomplete: boolean): void {
    this.onChange()({ ...this.config(), autocomplete });
  }
}

/** Inert preview of an ADDRESS question (FR2-17): the grouped card layout. */
@Component({
  selector: 'app-address-preview',
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <div class="address-preview">
      <span class="prompt">{{ question().prompt }}</span>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Country</mat-label>
        <input matInput disabled [placeholder]="countryPlaceholder" />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Street address</mat-label>
        <input matInput disabled />
      </mat-form-field>
      <div class="half-grid">
        @for (field of halfFields(); track field) {
          <mat-form-field appearance="outline">
            <mat-label>{{ labels[field] }}</mat-label>
            <input matInput disabled />
          </mat-form-field>
        }
      </div>
    </div>
  `,
  styles: `
    .address-preview {
      display: flex;
      flex-direction: column;
    }
    .prompt {
      font-size: 14px;
      margin-bottom: 4px;
    }
    .full {
      width: 100%;
    }
    .half-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 12px;
    }
  `,
})
export class AddressPreviewComponent {
  readonly question = input.required<QuestionDef>();

  protected readonly labels = FIELD_LABELS;

  protected readonly halfFields = computed(() =>
    addressEnabledFields(this.question().typeConfig).filter((f) => f !== 'country' && f !== 'line1'),
  );

  protected get countryPlaceholder(): string {
    const code = this.question().typeConfig['defaultCountry'];
    return typeof code === 'string' ? countryName(code) : 'Select a country…';
  }
}
