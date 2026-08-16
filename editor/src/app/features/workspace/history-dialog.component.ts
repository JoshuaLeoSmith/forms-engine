import { DatePipe, JsonPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService, apiErrors } from '../../core/api.service';
import type { QuestionnaireDetail, VersionDetail, VersionSummary } from '../../core/models';
import { ImpactDialogComponent, type ImpactDialogData } from './impact-dialog.component';

/**
 * Version history (FR-E-18): list of published versions, read-only view,
 * restore-to-draft with confirmation. History is append-only — restoring and
 * publishing creates a new version, it never rewrites old ones.
 */
@Component({
  selector: 'app-history-dialog',
  imports: [DatePipe, JsonPipe, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Version history</h2>
    <mat-dialog-content>
      @if (versions().length === 0) {
        <p class="fe-muted">Never published.</p>
      }
      @for (version of versions(); track version.versionNumber) {
        <div class="version-row">
          <div class="version-head">
            <strong>v{{ version.versionNumber }}</strong>
            @if (version.versionNumber === data.detail.currentVersion) {
              <span class="fe-badge">live</span>
            }
            <span class="fe-muted">{{ version.publishedAt | date: 'medium' }}</span>
            @if (version.note) {
              <span class="note">“{{ version.note }}”</span>
            }
            <span class="fe-spacer"></span>
            <button matButton (click)="toggleView(version)">
              {{ opened() === version.versionNumber ? 'Hide' : 'View' }}
            </button>
            <button matButton (click)="restore(version)">Restore to draft</button>
          </div>
          @if (opened() === version.versionNumber && openedDetail(); as detail) {
            <pre class="definition">{{ detail.definition | json }}</pre>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .version-row {
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e3e6eb);
      padding: 8px 0;
    }
    .version-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .note {
      font-style: italic;
    }
    .definition {
      max-height: 320px;
      overflow: auto;
      background: var(--mat-sys-surface-container, #f2f4f7);
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
    }
  `,
})
export class HistoryDialogComponent implements OnInit {
  protected readonly data = inject<{ detail: QuestionnaireDetail }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<HistoryDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly versions = signal<VersionSummary[]>([]);
  protected readonly opened = signal<number | null>(null);
  protected readonly openedDetail = signal<VersionDetail | null>(null);

  ngOnInit(): void {
    void this.api
      .versions(this.data.detail.id)
      .then((versions) => this.versions.set(versions))
      .catch((err) => this.snackBar.open(apiErrors(err).join('; '), 'Dismiss'));
  }

  protected async toggleView(version: VersionSummary): Promise<void> {
    if (this.opened() === version.versionNumber) {
      this.opened.set(null);
      this.openedDetail.set(null);
      return;
    }
    try {
      const detail = await this.api.version(this.data.detail.id, version.versionNumber);
      this.opened.set(version.versionNumber);
      this.openedDetail.set(detail);
    } catch (err) {
      this.snackBar.open(apiErrors(err).join('; '), 'Dismiss');
    }
  }

  protected restore(version: VersionSummary): void {
    this.dialog
      .open(ImpactDialogComponent, {
        width: '520px',
        data: {
          title: `Restore v${version.versionNumber} to draft?`,
          severity:
            'This overwrites the current draft with the contents of this version. Unpublished draft changes are lost. Publishing afterwards creates a new version — history is never rewritten.',
          items: [],
          confirmLabel: 'Restore to draft',
        } satisfies ImpactDialogData,
      })
      .afterClosed()
      .subscribe((confirmed?: boolean) => {
        if (!confirmed) {
          return;
        }
        void this.api
          .restore(this.data.detail.id, version.versionNumber)
          .then((detail) => this.ref.close(detail))
          .catch((err) => this.snackBar.open(apiErrors(err).join('; '), 'Dismiss'));
      });
  }
}
