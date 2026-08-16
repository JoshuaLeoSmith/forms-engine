import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface DeleteResponseDialogData {
  responseId: string;
  /** Files referenced by this response's answers — stated in the cascade warning. */
  fileCount: number;
}

/**
 * Typed-confirmation dialog for response deletion (FR4-10). Hard delete is
 * the point (P4-D7 — erasure, not soft-hide), so confirming requires typing
 * DELETE, mirroring the questionnaire deletion pattern.
 */
@Component({
  selector: 'app-delete-response-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Delete this response?</h2>
    <mat-dialog-content>
      <p class="severity">
        <mat-icon>warning</mat-icon>
        <span>
          This permanently deletes response <code>{{ data.responseId }}</code
          >@if (data.fileCount > 0) {<span>
            and its {{ data.fileCount }} uploaded {{ data.fileCount === 1 ? 'file' : 'files' }} from
            storage</span
          >}. There is no undo — erasure means erasure.
        </span>
      </p>
      <mat-form-field appearance="outline" class="wide" subscriptSizing="dynamic">
        <mat-label>Type DELETE to confirm</mat-label>
        <input matInput [ngModel]="typed()" (ngModelChange)="typed.set($event)" autocomplete="off" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" class="danger" [disabled]="!confirmed()" (click)="ref.close(true)">
        Delete response
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .severity {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      background: color-mix(in srgb, #c62828 8%, white);
      color: #8e1c1c;
      border-radius: 8px;
      padding: 12px;
    }
    .severity mat-icon {
      flex-shrink: 0;
      color: #c62828;
    }
    .wide {
      width: 100%;
      margin-top: 16px;
    }
    .danger {
      --mat-sys-primary: #c62828;
    }
  `,
})
export class DeleteResponseDialogComponent {
  protected readonly data = inject<DeleteResponseDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<DeleteResponseDialogComponent>);

  protected readonly typed = signal('');
  protected readonly confirmed = computed(() => this.typed().trim() === 'DELETE');
}
