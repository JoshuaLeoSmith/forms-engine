import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { QuestionDef } from '../../../core/models';
import { OptionsEditorComponent, type EditorOption } from './options-editor.component';

/** CHECKBOX config panel (Phase 2 §6.2): options + maxSelections. */
@Component({
  selector: 'app-checkbox-config',
  imports: [FormsModule, MatFormFieldModule, MatIconModule, MatInputModule, OptionsEditorComponent],
  template: `
    <app-options-editor
      [config]="config()"
      [onChange]="onChange()"
      fewOptionsWarning="Checkbox groups usually need at least 2 options"
    />
    <mat-form-field appearance="outline" class="max-field">
      <mat-label>Max selections</mat-label>
      <input
        matInput
        type="number"
        min="1"
        [ngModel]="maxSelections"
        (ngModelChange)="setMax($event)"
      />
      <mat-hint>Leave empty for unlimited.</mat-hint>
    </mat-form-field>
    @if (maxSelections === 1) {
      <p class="fe-badge">
        <mat-icon>lightbulb</mat-icon>
        With a max of 1, a Radio question may fit better.
      </p>
    }
  `,
  styles: `
    .max-field {
      margin-top: 8px;
      width: 200px;
    }
  `,
})
export class CheckboxConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();

  protected get maxSelections(): number | null {
    const value = this.config()['maxSelections'];
    return typeof value === 'number' ? value : null;
  }

  protected setMax(value: number | string | null): void {
    const parsed = value === null || value === '' ? null : Number(value);
    this.onChange()({
      ...this.config(),
      maxSelections: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    });
  }
}

/** Inert preview of a CHECKBOX question (FR2-17). */
@Component({
  selector: 'app-checkbox-preview',
  imports: [MatCheckboxModule],
  template: `
    <div class="preview">
      <span class="prompt">{{ question().prompt }}</span>
      @for (option of options; track option.id) {
        <mat-checkbox [disabled]="true">{{ option.label }}</mat-checkbox>
      }
    </div>
  `,
  styles: `
    .preview {
      display: flex;
      flex-direction: column;
    }
    .prompt {
      font-size: 14px;
      margin-bottom: 4px;
    }
  `,
})
export class CheckboxPreviewComponent {
  readonly question = input.required<QuestionDef>();

  protected get options(): EditorOption[] {
    return (this.question().typeConfig['options'] as EditorOption[]) ?? [];
  }
}

/** DROPDOWN config panel (Phase 2 §6.3): same options editor as RADIO. */
@Component({
  selector: 'app-dropdown-config',
  imports: [OptionsEditorComponent],
  template: `
    <app-options-editor
      [config]="config()"
      [onChange]="onChange()"
      fewOptionsWarning="Dropdowns usually need at least 2 options"
    />
  `,
})
export class DropdownConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();
}

/** Inert preview of a DROPDOWN question (FR2-17): closed searchable control. */
@Component({
  selector: 'app-dropdown-preview',
  imports: [MatFormFieldModule, MatSelectModule],
  template: `
    <mat-form-field appearance="outline" style="width: 100%;">
      <mat-label>{{ question().prompt }}</mat-label>
      <mat-select disabled [placeholder]="placeholder" />
    </mat-form-field>
  `,
})
export class DropdownPreviewComponent {
  readonly question = input.required<QuestionDef>();

  protected get placeholder(): string {
    const options = (this.question().typeConfig['options'] as EditorOption[]) ?? [];
    return options.length > 0 ? `Search ${options.length} options…` : 'Search…';
  }
}
