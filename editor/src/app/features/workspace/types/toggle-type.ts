import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { QuestionDef } from '../../../core/models';

/** TOGGLE config panel (Phase 2 §6.7): editable yes/no labels. */
@Component({
  selector: 'app-toggle-config',
  imports: [FormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="toggle-config">
      <mat-form-field appearance="outline">
        <mat-label>“Yes” label</mat-label>
        <input matInput [ngModel]="label('trueLabel')" (ngModelChange)="set('trueLabel', $event)" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>“No” label</mat-label>
        <input matInput [ngModel]="label('falseLabel')" (ngModelChange)="set('falseLabel', $event)" />
      </mat-form-field>
      <p class="hint">
        Respondents start with no selection — a required toggle forces an explicit choice.
      </p>
    </div>
  `,
  styles: `
    .toggle-config {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }
    mat-form-field {
      width: 220px;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
  `,
})
export class ToggleConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();

  protected label(key: 'trueLabel' | 'falseLabel'): string {
    return (this.config()[key] as string) ?? '';
  }

  protected set(key: 'trueLabel' | 'falseLabel', value: string): void {
    this.onChange()({ ...this.config(), [key]: value });
  }
}

/** Inert preview of a TOGGLE question (FR2-17): unselected segmented control. */
@Component({
  selector: 'app-toggle-preview',
  imports: [MatButtonToggleModule],
  template: `
    <div class="toggle-preview">
      <span class="prompt">{{ question().prompt }}</span>
      <mat-button-toggle-group disabled>
        <mat-button-toggle>{{ trueLabel }}</mat-button-toggle>
        <mat-button-toggle>{{ falseLabel }}</mat-button-toggle>
      </mat-button-toggle-group>
    </div>
  `,
  styles: `
    .toggle-preview {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .prompt {
      font-size: 14px;
    }
  `,
})
export class TogglePreviewComponent {
  readonly question = input.required<QuestionDef>();

  protected get trueLabel(): string {
    return (this.question().typeConfig['trueLabel'] as string) || 'Yes';
  }

  protected get falseLabel(): string {
    return (this.question().typeConfig['falseLabel'] as string) || 'No';
  }
}
