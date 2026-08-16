import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { QuestionDef } from '../../../core/models';

/** NUMBER config panel (Phase 2 §6.5): min/max/decimals + cosmetic adornment. */
@Component({
  selector: 'app-number-config',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <div class="number-config">
      <div class="row">
        <mat-form-field appearance="outline">
          <mat-label>Min</mat-label>
          <input matInput type="number" [ngModel]="num('min')" (ngModelChange)="setNum('min', $event)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Max</mat-label>
          <input matInput type="number" [ngModel]="num('max')" (ngModelChange)="setNum('max', $event)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Decimal places</mat-label>
          <input
            matInput
            type="number"
            min="0"
            max="10"
            [ngModel]="num('decimalPlaces')"
            (ngModelChange)="setNum('decimalPlaces', $event)"
          />
        </mat-form-field>
      </div>
      <div class="row">
        <mat-form-field appearance="outline">
          <mat-label>Adornment</mat-label>
          <mat-select [ngModel]="adornment" (ngModelChange)="setAdornment($event)">
            <mat-option value="NONE">None</mat-option>
            <mat-option value="PERCENT">Percent (%)</mat-option>
            <mat-option value="CURRENCY">Currency</mat-option>
          </mat-select>
        </mat-form-field>
        @if (adornment === 'CURRENCY') {
          <mat-form-field appearance="outline" class="symbol">
            <mat-label>Symbol</mat-label>
            <input matInput maxlength="4" [ngModel]="currencySymbol" (ngModelChange)="setSymbol($event)" />
          </mat-form-field>
        }
      </div>
      <p class="hint">Adornments are cosmetic only — the stored value is the bare number.</p>
    </div>
  `,
  styles: `
    .number-config {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    mat-form-field {
      width: 140px;
    }
    .symbol {
      width: 100px;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
  `,
})
export class NumberConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();

  protected num(key: 'min' | 'max' | 'decimalPlaces'): number | null {
    const value = this.config()[key];
    return typeof value === 'number' ? value : null;
  }

  protected get adornment(): string {
    return (this.config()['adornment'] as string) ?? 'NONE';
  }

  protected get currencySymbol(): string {
    return (this.config()['currencySymbol'] as string) ?? '$';
  }

  protected setNum(key: 'min' | 'max' | 'decimalPlaces', value: number | string | null): void {
    const parsed = value === null || value === '' ? null : Number(value);
    this.onChange()({
      ...this.config(),
      [key]: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    });
  }

  protected setAdornment(adornment: string): void {
    this.onChange()({ ...this.config(), adornment });
  }

  protected setSymbol(currencySymbol: string): void {
    this.onChange()({ ...this.config(), currencySymbol });
  }
}

/** Inert preview of a NUMBER question (FR2-17) with its adornment. */
@Component({
  selector: 'app-number-preview',
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" style="width: 100%;">
      <mat-label>{{ question().prompt }}</mat-label>
      @if (prefix) {
        <span matTextPrefix>{{ prefix }}&nbsp;</span>
      }
      <input matInput disabled inputmode="decimal" />
      @if (suffix) {
        <span matTextSuffix>{{ suffix }}</span>
      }
    </mat-form-field>
  `,
})
export class NumberPreviewComponent {
  readonly question = input.required<QuestionDef>();

  protected get prefix(): string | null {
    const config = this.question().typeConfig;
    return config['adornment'] === 'CURRENCY' ? ((config['currencySymbol'] as string) || '$') : null;
  }

  protected get suffix(): string | null {
    return this.question().typeConfig['adornment'] === 'PERCENT' ? '%' : null;
  }
}
