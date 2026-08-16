import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  addressEnabledFields,
  COUNTRIES,
  getQuestionType,
  US_STATES,
  type QuestionDef,
} from '@forms-engine/renderer/core';
import type { Condition, Operator, RuleConfig } from '../../core/models';

/** What the value input should offer for a referenced question (§6.5, FR2-16). */
export interface CodeInfo {
  type: string;
  /** Option labels when the referenced question is RADIO/DROPDOWN/CHECKBOX. */
  options?: string[];
  /** TOGGLE labels (values are true/false). */
  trueLabel?: string;
  falseLabel?: string;
  /** Enabled sub-fields when the referenced question is an ADDRESS. */
  addressSubFields?: string[];
  /** True when the ADDRESS default country is US (state dropdown, FR2-16). */
  usDefault?: boolean;
}

/**
 * Builds the rule builder's per-code target info from the draft's questions.
 * Non-answerable entries (DISPLAY_BLOCK) are excluded — never referenceable
 * (§6.9); so are types declaring no operators (FILE_UPLOAD, P3-D6) and
 * anything without a code.
 */
export function buildCodeInfo(questions: readonly QuestionDef[]): Record<string, CodeInfo> {
  const info: Record<string, CodeInfo> = {};
  for (const q of questions) {
    const mod = getQuestionType(q.type);
    if (!q.code || mod?.answerable === false || mod?.allowedOperators.length === 0) {
      continue;
    }
    const entry: CodeInfo = { type: q.type };
    if (['RADIO', 'DROPDOWN', 'CHECKBOX'].includes(q.type)) {
      entry.options = ((q.typeConfig['options'] as { label: string }[] | undefined) ?? []).map((o) => o.label);
    }
    if (q.type === 'TOGGLE') {
      entry.trueLabel = (q.typeConfig['trueLabel'] as string) || 'Yes';
      entry.falseLabel = (q.typeConfig['falseLabel'] as string) || 'No';
    }
    if (q.type === 'ADDRESS') {
      entry.addressSubFields = addressEnabledFields(q.typeConfig);
      entry.usDefault = q.typeConfig['defaultCountry'] === 'US';
    }
    info[q.code] = entry;
  }
  return info;
}

const OPERATOR_LABELS: Record<string, string> = {
  EQUALS: 'equals',
  NOT_EQUALS: 'not equals',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'does not contain',
  GREATER_THAN: 'greater than',
  LESS_THAN: 'less than',
  BEFORE: 'before',
  AFTER: 'after',
};

const DEFAULT_OPERATORS: readonly Operator[] = ['EQUALS', 'NOT_EQUALS'];

/**
 * Visibility / requirement rule builder (FR-E-10/11, FR2-16). The operator
 * dropdown filters to the referenced question type's allowed operators (§4.2)
 * and the value input adapts: option dropdown, date picker, numeric input,
 * toggle-label dropdown, or address sub-field selector + country/state
 * dropdowns. Changing the referenced question resets operator and value.
 */
@Component({
  selector: 'app-rule-builder',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <div class="rule-builder">
      <mat-checkbox [checked]="alwaysChecked()" (change)="toggleAlways($event.checked)">
        {{ aspect() === 'visibility' ? 'Always visible' : 'Always required' }}
      </mat-checkbox>

      @if (!alwaysChecked()) {
        @if (aspect() === 'requirement' && ownerKind() !== 'QUESTION') {
          <p class="hint">
            When this matches, every question in this {{ ownerKind() === 'STEP' ? 'step' : 'tab' }}
            becomes required.
          </p>
        }
        @if (aspect() === 'visibility' && conditions().length === 0) {
          <p class="fe-badge fe-badge-warn" role="status">
            <mat-icon>warning</mat-icon>
            This will never be shown — add a condition or re-check “Always visible”.
          </p>
        }
        @if (conditions().length > 0) {
          <mat-form-field appearance="outline" class="combinator">
            <mat-label>Match</mat-label>
            <mat-select [ngModel]="combinator()" (ngModelChange)="setCombinator($event)">
              <mat-option value="ALL">All conditions</mat-option>
              <mat-option value="ANY">Any condition</mat-option>
            </mat-select>
          </mat-form-field>
        }
        @for (condition of conditions(); track $index) {
          <div class="condition-row">
            <mat-form-field appearance="outline" class="code">
              <mat-label>Question</mat-label>
              <mat-select
                [ngModel]="condition.questionCode"
                (ngModelChange)="changeTarget($index, $event)"
              >
                @for (code of selectableCodes(); track code) {
                  <mat-option [value]="code">{{ code }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            @if (infoFor(condition); as info) {
              @if (info.addressSubFields; as subFields) {
                <mat-form-field appearance="outline" class="subfield">
                  <mat-label>Sub-field</mat-label>
                  <mat-select
                    [ngModel]="condition.subField"
                    (ngModelChange)="patchCondition($index, { subField: $event, value: '' })"
                  >
                    @for (field of subFields; track field) {
                      <mat-option [value]="field">{{ field }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }
            }

            <mat-form-field appearance="outline" class="operator">
              <mat-label>Operator</mat-label>
              <mat-select
                [ngModel]="condition.operator"
                (ngModelChange)="patchCondition($index, { operator: $event })"
              >
                @for (op of operatorsFor(condition); track op) {
                  <mat-option [value]="op">{{ operatorLabel(op) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            @switch (valueKindFor(condition)) {
              @case ('option') {
                <mat-form-field appearance="outline" class="value">
                  <mat-label>Value</mat-label>
                  <mat-select
                    [ngModel]="condition.value"
                    (ngModelChange)="patchCondition($index, { value: $event })"
                  >
                    @for (option of infoFor(condition)?.options ?? []; track option) {
                      <mat-option [value]="option">{{ option }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }
              @case ('boolean') {
                <mat-form-field appearance="outline" class="value">
                  <mat-label>Value</mat-label>
                  <mat-select
                    [ngModel]="condition.value"
                    (ngModelChange)="patchCondition($index, { value: $event })"
                  >
                    <mat-option [value]="true">{{ infoFor(condition)?.trueLabel ?? 'Yes' }}</mat-option>
                    <mat-option [value]="false">{{ infoFor(condition)?.falseLabel ?? 'No' }}</mat-option>
                  </mat-select>
                </mat-form-field>
              }
              @case ('number') {
                <mat-form-field appearance="outline" class="value">
                  <mat-label>Value</mat-label>
                  <input
                    matInput
                    type="number"
                    [ngModel]="condition.value"
                    (ngModelChange)="patchNumber($index, $event)"
                  />
                </mat-form-field>
              }
              @case ('date') {
                <mat-form-field appearance="outline" class="value">
                  <mat-label>Value</mat-label>
                  <input
                    matInput
                    type="date"
                    [ngModel]="condition.value"
                    (ngModelChange)="patchCondition($index, { value: $event })"
                  />
                </mat-form-field>
              }
              @case ('country') {
                <mat-form-field appearance="outline" class="value">
                  <mat-label>Country</mat-label>
                  <mat-select
                    [ngModel]="condition.value"
                    (ngModelChange)="patchCondition($index, { value: $event })"
                  >
                    @for (country of countries; track country.code) {
                      <mat-option [value]="country.code">{{ country.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }
              @case ('state') {
                <mat-form-field appearance="outline" class="value">
                  <mat-label>State</mat-label>
                  <mat-select
                    [ngModel]="condition.value"
                    (ngModelChange)="patchCondition($index, { value: $event })"
                  >
                    @for (state of states; track state.code) {
                      <mat-option [value]="state.code">{{ state.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }
              @default {
                <mat-form-field appearance="outline" class="value">
                  <mat-label>Value</mat-label>
                  <input
                    matInput
                    [ngModel]="condition.value"
                    (ngModelChange)="patchCondition($index, { value: $event })"
                  />
                </mat-form-field>
              }
            }

            <button
              matIconButton
              type="button"
              aria-label="Remove condition"
              (click)="removeCondition($index)"
            >
              <mat-icon>close</mat-icon>
            </button>
            @if (laterCodes().has(condition.questionCode)) {
              <mat-icon
                class="forward-warn"
                matTooltip="References a question the respondent answers later — this condition will be false until they go back."
                >history</mat-icon
              >
            }
          </div>
        }
        <button matButton type="button" (click)="addCondition()">
          <mat-icon>add</mat-icon>
          Add condition
        </button>
      }
    </div>
  `,
  styles: `
    .rule-builder {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
    .condition-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .combinator {
      width: 180px;
    }
    .code {
      width: 170px;
    }
    .subfield {
      width: 130px;
    }
    .operator {
      width: 150px;
    }
    .value {
      width: 180px;
    }
    .forward-warn {
      color: #b26a00;
      font-size: 20px;
    }
    mat-form-field {
      --mat-form-field-container-height: 44px;
    }
  `,
})
export class RuleBuilderComponent {
  readonly aspect = input.required<'visibility' | 'requirement'>();
  readonly ownerKind = input.required<'STEP' | 'TAB' | 'QUESTION'>();
  readonly config = input.required<RuleConfig>();
  /** Codes selectable in conditions (self-reference already excluded, §6.5). */
  readonly availableCodes = input.required<string[]>();
  readonly codeInfo = input.required<Record<string, CodeInfo>>();
  /** Codes appearing later in reading order than the owner (forward-reference warning). */
  readonly laterCodes = input<ReadonlySet<string>>(new Set());

  readonly configChange = output<RuleConfig>();

  protected readonly countries = COUNTRIES;
  protected readonly states = US_STATES;

  protected readonly alwaysChecked = computed(() => this.config().mode === 'ALWAYS');
  protected readonly conditions = computed<Condition[]>(() => this.config().rule?.conditions ?? []);
  protected readonly combinator = computed(() => this.config().rule?.combinator ?? 'ALL');

  protected infoFor(condition: Condition): CodeInfo | undefined {
    return this.codeInfo()[condition.questionCode];
  }

  /** Operators legal for the referenced question's type (§4.2, from the registry). */
  protected operatorsFor(condition: Condition): readonly Operator[] {
    const info = this.infoFor(condition);
    const allowed = info ? getQuestionType(info.type)?.allowedOperators : undefined;
    return allowed && allowed.length > 0 ? allowed : DEFAULT_OPERATORS;
  }

  protected operatorLabel(op: Operator): string {
    return OPERATOR_LABELS[op] ?? op.toLowerCase();
  }

  /** The value-input flavor for a condition (FR2-16). */
  protected valueKindFor(condition: Condition): string {
    const info = this.infoFor(condition);
    if (!info) {
      return 'text';
    }
    if (info.addressSubFields) {
      if (condition.subField === 'country') {
        return 'country';
      }
      if (condition.subField === 'state' && info.usDefault) {
        return 'state';
      }
      return 'text';
    }
    const kind = getQuestionType(info.type)?.conditionValueKind;
    switch (kind) {
      case 'option':
        return (info.options?.length ?? 0) > 0 ? 'option' : 'text';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'date':
        return 'date';
      default:
        return 'text';
    }
  }

  private emit(mode: 'ALWAYS' | 'UNCHECKED', conditions: Condition[], combinator: 'ALL' | 'ANY'): void {
    if (mode === 'ALWAYS') {
      this.configChange.emit({ mode: 'ALWAYS' });
    } else if (conditions.length === 0) {
      this.configChange.emit({ mode: 'NEVER' });
    } else {
      this.configChange.emit({ mode: 'CONDITIONAL', rule: { combinator, conditions } });
    }
  }

  protected toggleAlways(checked: boolean): void {
    if (checked) {
      this.emit('ALWAYS', [], 'ALL');
    } else {
      this.emit('UNCHECKED', this.conditions(), this.combinator());
    }
  }

  protected setCombinator(combinator: 'ALL' | 'ANY'): void {
    this.emit('UNCHECKED', this.conditions(), combinator);
  }

  /** Typed starting value per target (FR2-7): number 0, boolean true, else ''. */
  private freshCondition(questionCode: string): Condition {
    const info = this.codeInfo()[questionCode];
    const mod = info ? getQuestionType(info.type) : undefined;
    const operator = (mod?.allowedOperators[0] ?? 'EQUALS') as Operator;
    const kind = mod?.conditionValueKind;
    const value = kind === 'number' ? 0 : kind === 'boolean' ? true : '';
    const condition: Condition = { source: 'QUESTION', questionCode, operator, value };
    if (info?.addressSubFields && info.addressSubFields.length > 0) {
      condition.subField = info.addressSubFields[0];
      condition.value = '';
    }
    return condition;
  }

  /**
   * Codes offerable as condition targets: the caller's list minus anything
   * without a codeInfo entry — buildCodeInfo drops unanswerable types and
   * types declaring no operators (FILE_UPLOAD, P3-D6), so the dropdown
   * follows the registry with no type names hard-coded here.
   */
  protected selectableCodes(): string[] {
    return this.availableCodes().filter((code) => this.codeInfo()[code] !== undefined);
  }

  protected addCondition(): void {
    const first = this.selectableCodes()[0] ?? '';
    this.emit('UNCHECKED', [...this.conditions(), this.freshCondition(first)], this.combinator());
  }

  /** Changing the referenced question resets operator, sub-field and value (FR2-16). */
  protected changeTarget(index: number, questionCode: string): void {
    const next = this.conditions().map((c, i) => (i === index ? this.freshCondition(questionCode) : c));
    this.emit('UNCHECKED', next, this.combinator());
  }

  protected removeCondition(index: number): void {
    const next = this.conditions().filter((_, i) => i !== index);
    this.emit('UNCHECKED', next, this.combinator());
  }

  protected patchCondition(index: number, patch: Partial<Condition>): void {
    const next = this.conditions().map((c, i) => (i === index ? { ...c, ...patch } : c));
    this.emit('UNCHECKED', next, this.combinator());
  }

  protected patchNumber(index: number, raw: number | string | null): void {
    const parsed = raw === null || raw === '' ? 0 : Number(raw);
    this.patchCondition(index, { value: Number.isFinite(parsed) ? parsed : 0 });
  }
}
