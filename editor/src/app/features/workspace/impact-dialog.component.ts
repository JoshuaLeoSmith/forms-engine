import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ImpactDialogData {
  title: string;
  /** Severity notice (FR-E-13/14: codes are load-bearing). */
  severity: string;
  /** Optional lead-in, e.g. "This deletes 2 tabs and 9 questions." (FR-E-6). */
  intro?: string;
  /** Exhaustive list of affected rules / consequences. */
  items: string[];
  confirmLabel: string;
  danger?: boolean;
}

/** Impact confirmation for rename / delete operations (FR-E-6/13/14). */
@Component({
  selector: 'app-impact-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.intro) {
        <p class="intro">{{ data.intro }}</p>
      }
      <p class="severity">
        <mat-icon>warning</mat-icon>
        <span>{{ data.severity }}</span>
      </p>
      @if (data.items.length > 0) {
        <ul class="impact-list">
          @for (item of data.items; track $index) {
            <li>{{ item }}</li>
          }
        </ul>
      } @else {
        <p class="fe-muted">No rules reference this question.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" [class.danger]="data.danger" (click)="ref.close(true)">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .intro {
      font-weight: 500;
    }
    .severity {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      background: color-mix(in srgb, #b26a00 10%, white);
      color: #7a4a00;
      border-radius: 8px;
      padding: 12px;
    }
    .severity mat-icon {
      flex-shrink: 0;
      color: #b26a00;
    }
    .impact-list li {
      margin-bottom: 6px;
    }
    .danger {
      --mat-sys-primary: #c62828;
    }
  `,
})
export class ImpactDialogComponent {
  protected readonly data = inject<ImpactDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ImpactDialogComponent>);
}
