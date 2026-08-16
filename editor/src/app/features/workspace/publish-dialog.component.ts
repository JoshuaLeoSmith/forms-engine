import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService, apiErrors } from '../../core/api.service';
import type { QuestionnaireDetail } from '../../core/models';

/**
 * Publish confirmation with optional note (FR-E-16). Backend validation
 * failures are listed here and block the publish.
 */
@Component({
  selector: 'app-publish-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Publish changes</h2>
    <mat-dialog-content>
      <p>
        This snapshots the current draft as <strong>version {{ data.detail.currentVersion + 1 }}</strong>
        and makes it live for new respondents immediately. Respondents already in progress finish on
        the version they started.
      </p>
      <mat-form-field appearance="outline" style="width: 100%;">
        <mat-label>Publish note (optional)</mat-label>
        <input matInput [(ngModel)]="note" [disabled]="busy()" />
      </mat-form-field>
      @if (errors().length > 0) {
        <p><strong>The draft has problems that block publishing:</strong></p>
        <ul class="fe-error-list">
          @for (error of errors(); track $index) {
            <li>{{ error }}</li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close [disabled]="busy()">Cancel</button>
      <button matButton="filled" [disabled]="busy()" (click)="publish()">
        {{ busy() ? 'Publishing…' : 'Publish' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class PublishDialogComponent {
  protected readonly data = inject<{ detail: QuestionnaireDetail }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PublishDialogComponent>);
  private readonly api = inject(ApiService);

  protected note = '';
  protected readonly busy = signal(false);
  protected readonly errors = signal<string[]>([]);

  protected async publish(): Promise<void> {
    this.busy.set(true);
    this.errors.set([]);
    try {
      const updated = await this.api.publish(this.data.detail.id, this.note.trim() || null);
      this.ref.close(updated);
    } catch (err) {
      this.errors.set(apiErrors(err));
    } finally {
      this.busy.set(false);
    }
  }
}
