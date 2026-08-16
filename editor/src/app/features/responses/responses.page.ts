import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatInputModule } from '@angular/material/input';
import { ApiService, apiErrors, type ResponseFilter } from '../../core/api.service';
import type { Page, QuestionnaireDetail, ResponseExport, VersionSummary } from '../../core/models';
import { DeleteResponseDialogComponent, type DeleteResponseDialogData } from './delete-response-dialog.component';
import { answeredCount, fileCount, prettyAnswers } from './response-utils';

const PAGE_SIZE = 25;

/**
 * Minimal read-only responses browser (Phase 4 FR4-10): paginated table with
 * status/version filters — plus the Phase-5 external-reference column and
 * filter (FR5-3), making "did user #4821 complete intake?" one lookup — raw-
 * answers row expansion, per-row hard delete with the file-cascade warning
 * (FR4-9), and the FR4-15 CSV export button. Deliberately NOT an analytics
 * page — no charts, no aggregation.
 */
@Component({
  selector: 'app-responses',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  template: `
    <mat-toolbar>
      <button matIconButton [routerLink]="['/q', questionnaireId]" aria-label="Back to the questionnaire">
        <mat-icon>arrow_back</mat-icon>
      </button>
      @if (detail(); as d) {
        <span class="name">{{ d.name }}</span>
        <span class="fe-muted">Responses</span>
      }
      <span class="fe-spacer"></span>
      <span [matTooltip]="csvTooltip()">
        <button matButton="outlined" [disabled]="!csvAvailable()" (click)="downloadCsv()">
          <mat-icon>download</mat-icon>
          Export CSV
        </button>
      </span>
    </mat-toolbar>

    <div class="fe-page">
      <div class="filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select [ngModel]="statusFilter()" (ngModelChange)="setStatus($event)">
            <mat-option value="">All</mat-option>
            <mat-option value="IN_PROGRESS">In progress</mat-option>
            <mat-option value="COMPLETED">Completed</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Version</mat-label>
          <mat-select [ngModel]="versionFilter()" (ngModelChange)="setVersion($event)">
            <mat-option [value]="null">All</mat-option>
            @for (v of versions(); track v.versionNumber) {
              <mat-option [value]="v.versionNumber">v{{ v.versionNumber }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Reference</mat-label>
          <input
            matInput
            placeholder="external-ref"
            [ngModel]="refFilter()"
            (ngModelChange)="refFilter.set($event)"
            (keyup.enter)="applyRefFilter()"
            (blur)="applyRefFilter()"
          />
          @if (refFilter()) {
            <button matSuffix matIconButton aria-label="Clear reference filter" (click)="clearRefFilter()">
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>
        @if (versionFilter() === null && csvAvailable()) {
          <span class="fe-muted csv-note">CSV export covers one version — the live version unless a version filter is set.</span>
        }
      </div>

      @if (loading()) {
        <p class="fe-muted">Loading…</p>
      } @else if (error()) {
        <div class="fe-card">
          <p>{{ error() }}</p>
          <button matButton="outlined" (click)="load()">Retry</button>
        </div>
      } @else if (rows().length === 0) {
        <div class="fe-card" style="text-align: center; padding: 48px;">
          <p class="fe-muted">No responses match the current filters.</p>
        </div>
      } @else {
        <table class="list-table" aria-label="Responses">
          <thead>
            <tr>
              <th>Created</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Version</th>
              <th>Answered</th>
              <th>Files</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.responseId) {
              <tr class="row" (click)="toggleExpand(r.responseId)">
                <td>{{ r.createdAt | date: 'medium' }}</td>
                <td>
                  @if (r.externalRef) {
                    <code class="ref">{{ r.externalRef }}</code>
                  } @else {
                    <span class="fe-muted">—</span>
                  }
                </td>
                <td>
                  @if (r.status === 'COMPLETED') {
                    <span class="fe-badge">Completed</span>
                  } @else {
                    <span class="fe-badge fe-badge-warn">In progress</span>
                  }
                </td>
                <td>v{{ r.versionNumber }}</td>
                <td>{{ answered(r) }}</td>
                <td>{{ files(r) }}</td>
                <td (click)="$event.stopPropagation()">
                  <button
                    matIconButton
                    aria-label="Expand raw answers"
                    (click)="toggleExpand(r.responseId)"
                  >
                    <mat-icon>{{ expanded() === r.responseId ? 'expand_less' : 'expand_more' }}</mat-icon>
                  </button>
                  <button matIconButton aria-label="Delete response" (click)="remove(r)">
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </tr>
              @if (expanded() === r.responseId) {
                <tr class="expansion">
                  <td colspan="7">
                    <div class="raw">
                      <div class="raw-meta">
                        <code>{{ r.responseId }}</code>
                        @if (r.completedAt) {
                          <span class="fe-muted">completed {{ r.completedAt | date: 'medium' }}</span>
                        }
                      </div>
                      <pre>{{ raw(r) }}</pre>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>

        <div class="pager">
          <span class="fe-muted">{{ pageStart() }}–{{ pageEnd() }} of {{ total() }}</span>
          <button matIconButton [disabled]="page() === 0" (click)="setPage(page() - 1)" aria-label="Previous page">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <button matIconButton [disabled]="pageEnd() >= total()" (click)="setPage(page() + 1)" aria-label="Next page">
            <mat-icon>chevron_right</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    mat-toolbar {
      background: var(--mat-sys-surface, #fff);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #d4d8df);
      gap: 10px;
    }
    .name {
      font-weight: 600;
    }
    .filters {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 16px 0;
    }
    .csv-note {
      font-size: 12px;
    }
    .ref {
      font-size: 12px;
      word-break: break-all;
    }
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
      padding: 10px 16px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #eceff3);
    }
    .row {
      cursor: pointer;
    }
    .row:hover {
      background: var(--mat-sys-surface-container, #f2f4f7);
    }
    .expansion td {
      background: var(--mat-sys-surface-container-low, #fafbfc);
    }
    .raw-meta {
      display: flex;
      gap: 12px;
      align-items: baseline;
      margin-bottom: 8px;
    }
    pre {
      margin: 0;
      font-size: 12px;
      max-height: 320px;
      overflow: auto;
      background: var(--mat-sys-surface, #fff);
      border: 1px solid var(--mat-sys-outline-variant, #eceff3);
      border-radius: 8px;
      padding: 12px;
    }
    .pager {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
  `,
})
export class ResponsesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected questionnaireId = '';
  protected readonly detail = signal<QuestionnaireDetail | null>(null);
  protected readonly versions = signal<VersionSummary[]>([]);
  protected readonly rows = signal<ResponseExport[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly statusFilter = signal<'' | 'IN_PROGRESS' | 'COMPLETED'>('');
  protected readonly versionFilter = signal<number | null>(null);
  /** FR5-3: external-reference filter; applied on Enter/blur. */
  protected readonly refFilter = signal('');
  private appliedRefFilter = '';
  protected readonly expanded = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly pageStart = computed(() => (this.total() === 0 ? 0 : this.page() * PAGE_SIZE + 1));
  protected readonly pageEnd = computed(() => Math.min((this.page() + 1) * PAGE_SIZE, this.total()));

  /** CSV needs a published version to derive columns from (FR4-15). */
  protected readonly csvAvailable = computed(
    () => this.versionFilter() !== null || (this.detail()?.currentVersion ?? 0) > 0,
  );

  protected csvTooltip(): string {
    return this.csvAvailable() ? '' : 'Publish a version first — CSV columns derive from a published version.';
  }

  ngOnInit(): void {
    this.questionnaireId = this.route.snapshot.paramMap.get('id')!;
    void Promise.all([this.api.get(this.questionnaireId), this.api.versions(this.questionnaireId)])
      .then(([detail, versions]) => {
        this.detail.set(detail);
        this.versions.set([...versions].sort((a, b) => b.versionNumber - a.versionNumber));
      })
      .catch(() => this.error.set('Could not load this questionnaire.'));
    void this.load();
  }

  private filter(): ResponseFilter {
    return {
      status: this.statusFilter() || undefined,
      versionNumber: this.versionFilter() ?? undefined,
      externalRef: this.appliedRefFilter || undefined,
    };
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const result: Page<ResponseExport> = await this.api.responses(
        this.questionnaireId,
        this.filter(),
        this.page(),
        PAGE_SIZE,
      );
      this.rows.set(result.items);
      this.total.set(result.total);
    } catch (err) {
      this.error.set(apiErrors(err).join('; '));
    } finally {
      this.loading.set(false);
    }
  }

  protected setStatus(status: '' | 'IN_PROGRESS' | 'COMPLETED'): void {
    this.statusFilter.set(status);
    this.page.set(0);
    void this.load();
  }

  protected setVersion(versionNumber: number | null): void {
    this.versionFilter.set(versionNumber);
    this.page.set(0);
    void this.load();
  }

  protected applyRefFilter(): void {
    const ref = this.refFilter().trim();
    if (ref === this.appliedRefFilter) {
      return;
    }
    this.appliedRefFilter = ref;
    this.page.set(0);
    void this.load();
  }

  protected clearRefFilter(): void {
    this.refFilter.set('');
    this.applyRefFilter();
  }

  protected setPage(page: number): void {
    this.page.set(page);
    this.expanded.set(null);
    void this.load();
  }

  protected toggleExpand(responseId: string): void {
    this.expanded.set(this.expanded() === responseId ? null : responseId);
  }

  protected answered(r: ResponseExport): number {
    return answeredCount(r.answers);
  }

  protected files(r: ResponseExport): number {
    return fileCount(r.answers);
  }

  protected raw(r: ResponseExport): string {
    return prettyAnswers(r.answers);
  }

  /** FR4-9/FR4-10: typed confirmation stating the file cascade, then hard delete. */
  protected remove(r: ResponseExport): void {
    this.dialog
      .open(DeleteResponseDialogComponent, {
        width: '480px',
        data: { responseId: r.responseId, fileCount: fileCount(r.answers) } satisfies DeleteResponseDialogData,
      })
      .afterClosed()
      .subscribe((confirmed?: boolean) => {
        if (!confirmed) {
          return;
        }
        void this.api
          .deleteResponse(this.questionnaireId, r.responseId)
          .then(() => {
            this.snackBar.open('Response deleted', undefined, { duration: 2000 });
            // Last row of a page (other than the first) gone → step back one.
            if (this.rows().length === 1 && this.page() > 0) {
              this.page.set(this.page() - 1);
            }
            return this.load();
          })
          .catch((err) => this.snackBar.open(apiErrors(err).join('; '), 'Dismiss'));
      });
  }

  /** FR4-15: navigates to the streamed CSV attachment for the current filters. */
  protected downloadCsv(): void {
    const filter = this.filter();
    window.location.assign(this.api.csvExportUrl(this.questionnaireId, filter));
  }
}
