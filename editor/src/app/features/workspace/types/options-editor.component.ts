import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { newId } from '../../../core/ids';

export interface EditorOption {
  id: string;
  label: string;
}

/**
 * Shared orderable/deletable option list used by the RADIO, CHECKBOX and
 * DROPDOWN config panels (BRD §5.4, Phase 2 §6.2/§6.3 — "identical to
 * RADIO's").
 */
@Component({
  selector: 'app-options-editor',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="options">
      <span class="label">Options</span>
      @if (options.length < 2) {
        <span class="fe-badge fe-badge-warn">
          <mat-icon>warning</mat-icon>
          {{ fewOptionsWarning() }}
        </span>
      }
      @for (option of options; track option.id) {
        <div class="option-row">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Option {{ $index + 1 }}</mat-label>
            <input matInput [ngModel]="option.label" (ngModelChange)="setLabel($index, $event)" />
          </mat-form-field>
          <button matIconButton type="button" aria-label="Move option up" [disabled]="$index === 0" (click)="move($index, -1)">
            <mat-icon>arrow_upward</mat-icon>
          </button>
          <button
            matIconButton
            type="button"
            aria-label="Move option down"
            [disabled]="$index === options.length - 1"
            (click)="move($index, 1)"
          >
            <mat-icon>arrow_downward</mat-icon>
          </button>
          <button matIconButton type="button" aria-label="Delete option" (click)="remove($index)">
            <mat-icon>delete</mat-icon>
          </button>
        </div>
      }
      <button matButton type="button" (click)="add()">
        <mat-icon>add</mat-icon>
        Add option
      </button>
    </div>
  `,
  styles: `
    .options {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }
    .label {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
    .option-row {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
    }
    .grow {
      flex: 1;
    }
  `,
})
export class OptionsEditorComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();
  readonly fewOptionsWarning = input<string>('Usually needs at least 2 options');

  protected get options(): EditorOption[] {
    return (this.config()['options'] as EditorOption[]) ?? [];
  }

  private emit(options: EditorOption[]): void {
    this.onChange()({ ...this.config(), options });
  }

  protected add(): void {
    this.emit([...this.options, { id: newId(), label: '' }]);
  }

  protected remove(index: number): void {
    this.emit(this.options.filter((_, i) => i !== index));
  }

  protected move(index: number, direction: -1 | 1): void {
    const next = [...this.options];
    const target = index + direction;
    if (target < 0 || target >= next.length) {
      return;
    }
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    this.emit(next);
  }

  protected setLabel(index: number, label: string): void {
    this.emit(this.options.map((o, i) => (i === index ? { ...o, label } : o)));
  }
}
