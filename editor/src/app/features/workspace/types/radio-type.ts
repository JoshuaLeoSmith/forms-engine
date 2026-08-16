import { Component, input } from '@angular/core';
import { MatRadioModule } from '@angular/material/radio';
import type { QuestionDef } from '../../../core/models';
import { OptionsEditorComponent, type EditorOption } from './options-editor.component';

type RadioOption = EditorOption;

/** RADIO config panel: the shared orderable option list (BRD §5.4, FR-E-7). */
@Component({
  selector: 'app-radio-config',
  imports: [OptionsEditorComponent],
  template: `
    <app-options-editor
      [config]="config()"
      [onChange]="onChange()"
      fewOptionsWarning="Radios usually need at least 2 options"
    />
  `,
})
export class RadioConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();
}

/** Inert live-style preview of a RADIO question (FR-E-5). */
@Component({
  selector: 'app-radio-preview',
  imports: [MatRadioModule],
  template: `
    <div class="radio-preview">
      <span class="prompt">{{ question().prompt }}</span>
      <mat-radio-group [disabled]="true">
        @for (option of options; track option.id) {
          <mat-radio-button [value]="option.label">{{ option.label }}</mat-radio-button>
        }
      </mat-radio-group>
    </div>
  `,
  styles: `
    .radio-preview {
      display: flex;
      flex-direction: column;
    }
    .prompt {
      font-size: 14px;
      margin-bottom: 4px;
    }
    mat-radio-group {
      display: flex;
      flex-direction: column;
    }
  `,
})
export class RadioPreviewComponent {
  readonly question = input.required<QuestionDef>();

  protected get options(): RadioOption[] {
    return (this.question().typeConfig['options'] as RadioOption[]) ?? [];
  }
}
