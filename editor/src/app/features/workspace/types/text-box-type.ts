import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { QuestionDef } from '../../../core/models';

/** TEXT_BOX config panel: Size dropdown + optional character limit (§6.1). */
@Component({
  selector: 'app-text-box-config',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <mat-form-field appearance="outline" style="width: 100%;">
      <mat-label>Textbox Size</mat-label>
      <mat-select [ngModel]="size" (ngModelChange)="setSize($event)">
        <mat-option value="SMALL">Small</mat-option>
        <mat-option value="MEDIUM">Medium</mat-option>
        <mat-option value="LARGE">Large</mat-option>
      </mat-select>
    </mat-form-field>
    <mat-form-field appearance="outline" style="width: 200px;">
      <mat-label>Character limit</mat-label>
      <input matInput type="number" min="1" max="10000" [ngModel]="maxLength" (ngModelChange)="setMaxLength($event)" />
      <mat-hint>Leave empty for none.</mat-hint>
    </mat-form-field>
  `,
})
export class TextBoxConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();

  protected get size(): string {
    return (this.config()['size'] as string) ?? 'MEDIUM';
  }

  protected get maxLength(): number | null {
    const value = this.config()['maxLength'];
    return typeof value === 'number' ? value : null;
  }

  protected setSize(size: string): void {
    this.onChange()({ ...this.config(), size });
  }

  protected setMaxLength(value: number | string | null): void {
    const parsed = value === null || value === '' ? null : Number(value);
    this.onChange()({
      ...this.config(),
      maxLength: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    });
  }
}

/** Inert live-style preview of a TEXT_BOX question (FR-E-5). */
@Component({
  selector: 'app-text-box-preview',
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    @if (isLarge) {
      <mat-form-field appearance="outline" style="width: 100%;">
        <mat-label>{{ question().prompt }}</mat-label>
        <textarea matInput rows="4" disabled></textarea>
      </mat-form-field>
    } @else {
      <mat-form-field appearance="outline" [style.width]="isSmall ? '220px' : '100%'">
        <mat-label>{{ question().prompt }}</mat-label>
        <input matInput disabled />
      </mat-form-field>
    }
  `,
})
export class TextBoxPreviewComponent {
  readonly question = input.required<QuestionDef>();

  protected get isLarge(): boolean {
    return this.question().typeConfig['size'] === 'LARGE';
  }

  protected get isSmall(): boolean {
    return this.question().typeConfig['size'] === 'SMALL';
  }
}
