import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ApiService, apiErrors } from '../../core/api.service';
import type { QuestionnaireSummary } from '../../core/models';
import { DeleteQuestionnaireDialogComponent } from './delete-questionnaire-dialog.component';
import { NameDialogComponent } from './name-dialog.component';

/** Landing page: all questionnaires with create/rename/duplicate/delete (FR-E-1). */
@Component({
  selector: 'app-questionnaire-list',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <span style="font-weight: 600;">Forms-Engine</span>
      <span class="fe-spacer"></span>
      <input
        #importInput
        type="file"
        accept="application/json,.json"
        class="import-input"
        (change)="importFile($event)"
      />
      <button matButton (click)="importInput.click()">
        <mat-icon>upload_file</mat-icon>
        Import
      </button>
      <button matButton="filled" (click)="create()">
        <mat-icon>add</mat-icon>
        New questionnaire
      </button>
    </mat-toolbar>
    <div class="fe-page">
      @if (loading()) {
        <p class="fe-muted">Loading…</p>
      } @else if (error()) {
        <div class="fe-card">
          <p>Could not reach the backend at its configured address.</p>
          <p class="fe-muted">{{ error() }}</p>
          <button matButton="outlined" (click)="load()">Retry</button>
        </div>
      } @else if (items().length === 0) {
        <div class="fe-card" style="text-align: center; padding: 48px;">
          <h2>No questionnaires yet</h2>
          <p class="fe-muted">Create your first questionnaire to get started.</p>
          <button matButton="filled" (click)="create()">New questionnaire</button>
        </div>
      } @else {
        <table class="list-table" aria-label="Questionnaires">
          <thead>
            <tr>
              <th>Name</th>
              <th>Public id</th>
              <th>Live version</th>
              <th>Draft modified</th>
              <th>Responses</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (q of items(); track q.id) {
              <tr class="row" (click)="open(q)">
                <td>
                  <span class="name">{{ q.name }}</span>
                  @if (q.hasUnpublishedChanges && q.currentVersion > 0) {
                    <span class="fe-badge fe-badge-warn" matTooltip="The draft differs from the live version">draft edited</span>
                  }
                </td>
                <td><code>{{ q.publicId }}</code></td>
                <td>
                  @if (q.currentVersion > 0) {
                    v{{ q.currentVersion }}
                  } @else {
                    <span class="fe-muted">never published</span>
                  }
                </td>
                <td>{{ q.updatedAt | date: 'medium' }}</td>
                <td>{{ q.responseCount }}</td>
                <td (click)="$event.stopPropagation()">
                  <button matIconButton [matMenuTriggerFor]="menu" aria-label="Questionnaire actions">
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #menu="matMenu">
                    <button mat-menu-item (click)="open(q)"><mat-icon>edit</mat-icon>Open</button>
                    <button mat-menu-item (click)="rename(q)"><mat-icon>drive_file_rename_outline</mat-icon>Rename</button>
                    <button mat-menu-item (click)="duplicate(q)"><mat-icon>content_copy</mat-icon>Duplicate</button>
                    <button mat-menu-item (click)="exportQuestionnaire(q)"><mat-icon>download</mat-icon>Export</button>
                    <button mat-menu-item (click)="remove(q)"><mat-icon>delete</mat-icon>Delete</button>
                  </mat-menu>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: `
    .list-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--mat-sys-surface, #fff);
      border: 1px solid var(--mat-sys-outline-variant, #d4d8df);
      border-radius: 12px;
      overflow: hidden;
    }
    th {
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mat-sys-on-surface-variant, #5f6672);
      padding: 12px 16px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #d4d8df);
    }
    td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #eceff3);
    }
    .row {
      cursor: pointer;
    }
    .row:hover {
      background: var(--mat-sys-surface-container, #f2f4f7);
    }
    .name {
      font-weight: 500;
      margin-right: 8px;
    }
    .import-input {
      display: none;
    }
  `,
})
export class QuestionnaireListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly items = signal<QuestionnaireSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.api.list();
      this.items.set(page.items);
    } catch (err) {
      this.error.set(apiErrors(err).join('; '));
    } finally {
      this.loading.set(false);
    }
  }

  protected open(q: QuestionnaireSummary): void {
    void this.router.navigate(['/q', q.id]);
  }

  protected create(): void {
    this.dialog
      .open(NameDialogComponent, {
        data: { title: 'New questionnaire', label: 'Name', confirmLabel: 'Create' },
        width: '420px',
      })
      .afterClosed()
      .subscribe((name?: string) => {
        if (!name) {
          return;
        }
        void this.api
          .create(name)
          .then((detail) => this.router.navigate(['/q', detail.id]))
          .catch((err) => this.snackBar.open(apiErrors(err).join('; '), 'Dismiss'));
      });
  }

  protected rename(q: QuestionnaireSummary): void {
    this.dialog
      .open(NameDialogComponent, {
        data: { title: 'Rename questionnaire', label: 'Name', confirmLabel: 'Rename', initial: q.name },
        width: '420px',
      })
      .afterClosed()
      .subscribe((name?: string) => {
        if (!name || name === q.name) {
          return;
        }
        void this.api
          .rename(q.id, name)
          .then(() => this.load())
          .catch((err) => this.snackBar.open(apiErrors(err).join('; '), 'Dismiss'));
      });
  }

  protected duplicate(q: QuestionnaireSummary): void {
    void this.api
      .duplicate(q.id)
      .then(() => this.load())
      .catch((err) => this.snackBar.open(apiErrors(err).join('; '), 'Dismiss'));
  }

  /** FR4-11: same-tab navigation to the attachment — the server names the file. */
  protected exportQuestionnaire(q: QuestionnaireSummary): void {
    window.location.assign(this.api.exportUrl(q.id));
  }

  /** FR4-12: import always creates; validation failures list every blocker. */
  protected importFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    void file
      .text()
      .then((text) => {
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          throw { error: { message: 'This file is not valid JSON.' } };
        }
        return this.api.importQuestionnaire(payload);
      })
      .then((detail) => {
        this.snackBar.open(`Imported "${detail.name}"`, undefined, { duration: 3000 });
        return this.load();
      })
      .catch((err) => {
        void import('../workspace/impact-dialog.component').then(({ ImpactDialogComponent }) => {
          this.dialog.open(ImpactDialogComponent, {
            width: '560px',
            data: {
              title: 'Import failed',
              severity: 'Nothing was created. Fix the export file and try again.',
              items: apiErrors(err),
              confirmLabel: 'OK',
            },
          });
        });
      });
  }

  protected remove(q: QuestionnaireSummary): void {
    // FR3-13: the confirmation states the retained file count and total bytes.
    void this.api
      .fileStats(q.id)
      .catch(() => undefined)
      .then((files) => {
        this.dialog
          .open(DeleteQuestionnaireDialogComponent, { data: { name: q.name, files }, width: '480px' })
          .afterClosed()
          .subscribe((confirmed?: boolean) => {
            if (!confirmed) {
              return;
            }
            void this.api
              .delete(q.id)
              .then(() => this.load())
              .catch((err) => this.snackBar.open(apiErrors(err).join('; '), 'Dismiss'));
          });
      });
  }
}
