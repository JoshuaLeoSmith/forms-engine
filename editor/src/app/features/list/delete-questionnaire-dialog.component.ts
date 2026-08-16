import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/**
 * Typed-name delete confirmation (FR-E-1, Phase 3 FR3-13): warns that
 * responses — and their uploaded files — are retained but orphaned, and
 * requires typing the questionnaire name to confirm.
 */
@Component({
  selector: 'app-delete-questionnaire-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Delete “{{ data.name }}”?</h2>
    <mat-dialog-content>
      <p>
        This permanently deletes the questionnaire and its version history. Submitted responses are
        <strong>retained</strong> in the database but become orphaned — nothing will reference them
        anymore.
      </p>
      @if (data.files && data.files.fileCount > 0) {
        <p>
          Also retained: <strong>{{ data.files.fileCount }}</strong> uploaded
          {{ data.files.fileCount === 1 ? 'file' : 'files' }}
          (<strong>{{ megabytes(data.files.totalBytes) }}</strong>) in file storage.
        </p>
      }
      <p>
        Type <strong>{{ data.name }}</strong> to confirm.
      </p>
      <mat-form-field appearance="outline" style="width: 100%;">
        <mat-label>Questionnaire name</mat-label>
        <input matInput [(ngModel)]="typed" cdkFocusInitial />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" class="danger" [disabled]="typed !== data.name" (click)="ref.close(true)">
        Delete forever
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .danger:not([disabled]) {
      --mat-sys-primary: #c62828;
    }
  `,
})
export class DeleteQuestionnaireDialogComponent {
  protected readonly data = inject<{ name: string; files?: { fileCount: number; totalBytes: number } }>(
    MAT_DIALOG_DATA,
  );
  protected readonly ref = inject(MatDialogRef<DeleteQuestionnaireDialogComponent>);
  protected typed = '';

  protected megabytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  }
}
