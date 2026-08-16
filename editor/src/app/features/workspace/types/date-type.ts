import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { QuestionDef } from '../../../core/models';

/** DATE config panel (Phase 2 §6.4): optional min/max + past/future switches. */
@Component({
  selector: 'app-date-config',
  imports: [FormsModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="date-config">
      <mat-form-field appearance="outline">
        <mat-label>Earliest date</mat-label>
        <input matInput type="date" [ngModel]="minDate" (ngModelChange)="set('minDate', $event)" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Latest date</mat-label>
        <input matInput type="date" [ngModel]="maxDate" (ngModelChange)="set('maxDate', $event)" />
      </mat-form-field>
      <mat-checkbox [checked]="flag('disallowPast')" (change)="setFlag('disallowPast', $event.checked)">
        Disallow past dates
      </mat-checkbox>
      <mat-checkbox [checked]="flag('disallowFuture')" (change)="setFlag('disallowFuture', $event.checked)">
        Disallow future dates
      </mat-checkbox>
      @if (flag('disallowPast') && flag('disallowFuture')) {
        <p class="fe-badge fe-badge-warn">
          <mat-icon>warning</mat-icon>
          No valid dates would remain except today; use min/max instead.
        </p>
      }
    </div>
  `,
  styles: `
    .date-config {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }
    mat-form-field {
      width: 220px;
    }
  `,
})
export class DateConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();

  protected get minDate(): string {
    return (this.config()['minDate'] as string) ?? '';
  }

  protected get maxDate(): string {
    return (this.config()['maxDate'] as string) ?? '';
  }

  protected flag(key: 'disallowPast' | 'disallowFuture'): boolean {
    return this.config()[key] === true;
  }

  protected set(key: 'minDate' | 'maxDate', value: string): void {
    this.onChange()({ ...this.config(), [key]: value || null });
  }

  protected setFlag(key: 'disallowPast' | 'disallowFuture', checked: boolean): void {
    this.onChange()({ ...this.config(), [key]: checked });
  }
}

/** Inert preview of a DATE question (FR2-17): field + calendar affordance. */
@Component({
  selector: 'app-date-preview',
  imports: [MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" style="width: 100%;">
      <mat-label>{{ question().prompt }}</mat-label>
      <input matInput disabled placeholder="YYYY-MM-DD" />
      <mat-icon matSuffix>calendar_today</mat-icon>
    </mat-form-field>
  `,
})
export class DatePreviewComponent {
  readonly question = input.required<QuestionDef>();
}
