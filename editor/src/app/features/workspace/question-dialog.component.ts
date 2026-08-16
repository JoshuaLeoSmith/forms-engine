import { NgComponentOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { getQuestionType } from '@forms-engine/renderer/core';
import { newId } from '../../core/ids';
import { QUESTION_CODE_PATTERN, type QuestionDef, type QuestionWidth, type RuleConfig } from '../../core/models';
import { RuleBuilderComponent, type CodeInfo } from './rule-builder.component';
import { getEditorQuestionType, listEditorQuestionTypes } from './types/editor-type-registry';

export interface QuestionDialogData {
  /** Present when editing; absent when adding. */
  question?: QuestionDef;
  /** Every code in the draft (uniqueness check; excludes self when editing). */
  existingCodes: string[];
  /** Section titles already used on the current screen (autocomplete, FR-E-7). */
  sectionTitles: string[];
  /** Per-code type info for rule value inputs (§6.5). */
  codeInfo: Record<string, CodeInfo>;
  /** Codes later in reading order than this question (forward-ref warning). */
  laterCodes: string[];
  /** Default section for a new question (last section on screen). */
  defaultSection?: string;
}

/**
 * Add / Edit Question modal (FR-E-7/8/9): code, section, prompt, type +
 * type-specific config panel, three-state width control, and the question's
 * visibility & requirement rule panels in one place.
 */
@Component({
  selector: 'app-question-dialog',
  imports: [
    FormsModule,
    NgComponentOutlet,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    RuleBuilderComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.question ? 'Edit Question' : 'Add Question' }}</h2>
    <mat-dialog-content>
      <div class="grid">
        <div class="left">
          @if (answerable()) {
            <!-- subscriptSizing="dynamic": these hints/errors can wrap to two
                 lines at this column width; the default fixed one-line
                 subscript would paint the overflow over the next field. -->
            <mat-form-field appearance="outline" class="wide" subscriptSizing="dynamic">
              <mat-label>Unique Question Code</mat-label>
              <input
                matInput
                required
                [ngModel]="code()"
                (ngModelChange)="code.set($event)"
                [errorStateMatcher]="codeErrorMatcher"
              />
              @if (codeError(); as err) {
                <mat-error>{{ err }}</mat-error>
              }
              <mat-hint>Used in submitted data and in rules — choose carefully.</mat-hint>
            </mat-form-field>
          }

          <mat-form-field appearance="outline" class="wide" subscriptSizing="dynamic">
            <mat-label>Section</mat-label>
            <input
              matInput
              [ngModel]="sectionTitle()"
              (ngModelChange)="sectionTitle.set($event)"
              [matAutocomplete]="sectionAuto"
            />
            <mat-autocomplete #sectionAuto="matAutocomplete">
              @for (title of data.sectionTitles; track title) {
                <mat-option [value]="title">{{ title }}</mat-option>
              }
            </mat-autocomplete>
            <mat-hint>Consecutive questions with the same section share a card.</mat-hint>
          </mat-form-field>

          @if (answerable()) {
            <mat-form-field appearance="outline" class="wide">
              <mat-label>Prompt</mat-label>
              <input matInput required [ngModel]="prompt()" (ngModelChange)="prompt.set($event)" />
            </mat-form-field>
          }

          <mat-form-field appearance="outline" class="wide">
            <mat-label>Question Type</mat-label>
            <mat-select [ngModel]="displayType()" (ngModelChange)="requestType($event)">
              @for (entry of typeEntries; track entry.type) {
                <mat-option [value]="entry.type">{{ entry.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (pendingType(); as pending) {
            <div class="type-switch-confirm" role="alertdialog">
              <mat-icon>warning</mat-icon>
              <span>Switching to {{ labelOf(pending) }} discards this type's configuration.</span>
              <button matButton type="button" (click)="confirmTypeSwitch()">Switch</button>
              <button matButton type="button" (click)="cancelTypeSwitch()">Keep</button>
            </div>
          }

          <div class="width-control">
            <span class="label">Width</span>
            <mat-button-toggle-group
              [value]="width()"
              (change)="width.set($event.value)"
              aria-label="Question width"
            >
              <mat-button-toggle value="DEFAULT">Default</mat-button-toggle>
              <mat-button-toggle value="HALF">Half</mat-button-toggle>
              <mat-button-toggle value="FULL">Full</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
        </div>

        <div class="right">
          @if (panelComponent(); as panel) {
            <ng-container
              *ngComponentOutlet="panel; inputs: { config: typeConfig(), onChange: onConfigChange }"
            />
          }
          @for (problem of configProblems(); track problem) {
            <p class="config-problem">{{ problem }}</p>
          }
        </div>
      </div>

      <h3>Visibility</h3>
      <app-rule-builder
        aspect="visibility"
        ownerKind="QUESTION"
        [config]="visibility()"
        [availableCodes]="availableCodes()"
        [codeInfo]="data.codeInfo"
        [laterCodes]="laterCodesSet"
        (configChange)="visibility.set($event)"
      />

      @if (answerable()) {
        <h3>Requirement</h3>
        <app-rule-builder
          aspect="requirement"
          ownerKind="QUESTION"
          [config]="requirement()"
          [availableCodes]="availableCodes()"
          [codeInfo]="data.codeInfo"
          [laterCodes]="laterCodesSet"
          (configChange)="requirement.set($event)"
        />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" [disabled]="!valid()" (click)="save()">
        {{ data.question ? 'Save question' : 'Add question' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 8px;
    }
    .left,
    .right {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .wide {
      width: 100%;
    }
    .width-control {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .label {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
    .config-problem {
      color: var(--mat-sys-error, #c62828);
      font-size: 12px;
      margin: 4px 0 0;
    }
    .type-switch-confirm {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      background: var(--mat-sys-surface-container, #f2f4f7);
      border: 1px solid var(--mat-sys-outline-variant, #d4d8df);
      border-radius: 8px;
      padding: 6px 10px;
    }
    .type-switch-confirm mat-icon {
      color: #b26a00;
    }
    h3 {
      margin: 20px 0 8px;
      font-size: 14px;
    }
    @media (max-width: 720px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class QuestionDialogComponent {
  protected readonly data = inject<QuestionDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<QuestionDialogComponent>);

  protected readonly typeEntries = listEditorQuestionTypes();
  protected readonly laterCodesSet = new Set(this.data.laterCodes);

  private readonly original = this.data.question;

  protected readonly code = signal(this.original?.code ?? '');
  protected readonly sectionTitle = signal(this.original?.sectionTitle ?? this.data.defaultSection ?? '');
  protected readonly prompt = signal(this.original?.prompt ?? '');
  protected readonly type = signal(this.original?.type ?? 'TEXT_BOX');
  protected readonly width = signal<QuestionWidth>(this.original?.width ?? 'DEFAULT');
  protected readonly typeConfig = signal<Record<string, unknown>>(
    structuredClone(this.original?.typeConfig ?? getEditorQuestionType('TEXT_BOX')!.defaultConfig()),
  );
  protected readonly visibility = signal<RuleConfig>(
    structuredClone(this.original?.visibility ?? { mode: 'ALWAYS' }),
  );
  protected readonly requirement = signal<RuleConfig>(
    structuredClone(this.original?.requirement ?? { mode: 'ALWAYS' }),
  );

  protected readonly onConfigChange = (config: Record<string, unknown>) => this.typeConfig.set(config);

  protected readonly panelComponent = computed(() => getEditorQuestionType(this.type())?.panel ?? null);

  /** DISPLAY_BLOCK-style entries have no code, prompt, or requirement (§6.9). */
  protected readonly answerable = computed(() => getQuestionType(this.type())?.answerable !== false);

  /** FR2-14: a type switch awaiting the discard-config confirmation. */
  protected readonly pendingType = signal<string | null>(null);
  /** What the type select shows: the pending choice until confirmed/reverted. */
  protected readonly displayType = computed(() => this.pendingType() ?? this.type());

  /** Self-reference is rejected by construction (§6.5). */
  protected readonly availableCodes = computed(() =>
    this.data.existingCodes.filter((c) => c !== this.code() && c !== this.original?.code),
  );

  /**
   * codeError() is signal-based (pattern, uniqueness), not an Angular
   * validator, so Material's default matcher would never show the mat-error —
   * the field just silently disabled Save.
   */
  protected readonly codeErrorMatcher: ErrorStateMatcher = {
    isErrorState: (control) => !!this.codeError() && !!control && (control.dirty || control.touched),
  };

  protected readonly codeError = computed<string | null>(() => {
    if (!this.answerable()) {
      return null;
    }
    const value = this.code().trim();
    if (!value) {
      return 'A question code is required.';
    }
    if (!QUESTION_CODE_PATTERN.test(value)) {
      return 'Must start with a letter; letters, digits, _ and - only; max 64 chars.';
    }
    const taken = this.data.existingCodes.some((c) => c === value && c !== this.original?.code);
    return taken ? 'This code is already used in this questionnaire.' : null;
  });

  protected readonly configProblems = computed(() =>
    getEditorQuestionType(this.type())?.validateConfig(this.typeConfig()) ?? [],
  );

  protected readonly valid = computed(
    () =>
      !this.codeError() &&
      (!this.answerable() || this.prompt().trim().length > 0) &&
      this.configProblems().length === 0 &&
      this.pendingType() === null,
  );

  protected labelOf(type: string): string {
    return getEditorQuestionType(type)?.label ?? type;
  }

  /**
   * FR2-14: switching type swaps the config panel and discards the previous
   * type's config — after an inline confirm when non-default values would be
   * lost.
   */
  protected requestType(type: string): void {
    if (type === this.type()) {
      this.pendingType.set(null);
      return;
    }
    const currentDefault = getEditorQuestionType(this.type())?.defaultConfig() ?? {};
    const untouched = JSON.stringify(this.typeConfig()) === JSON.stringify(currentDefault);
    if (untouched) {
      this.applyType(type);
    } else {
      this.pendingType.set(type);
    }
  }

  protected confirmTypeSwitch(): void {
    const pending = this.pendingType();
    if (pending) {
      this.applyType(pending);
    }
  }

  protected cancelTypeSwitch(): void {
    this.pendingType.set(null);
  }

  private applyType(type: string): void {
    this.type.set(type);
    this.typeConfig.set(getEditorQuestionType(type)?.defaultConfig() ?? {});
    this.pendingType.set(null);
  }

  protected save(): void {
    if (!this.valid()) {
      return;
    }
    const answerable = this.answerable();
    const result: QuestionDef = {
      id: this.original?.id ?? newId(),
      code: answerable ? this.code().trim() : '',
      sectionTitle: this.sectionTitle().trim(),
      prompt: answerable ? this.prompt().trim() : '',
      type: this.type(),
      width: this.width(),
      typeConfig: this.typeConfig(),
      visibility: this.visibility(),
      requirement: answerable ? this.requirement() : { mode: 'NEVER' },
    };
    this.ref.close(result);
  }
}
