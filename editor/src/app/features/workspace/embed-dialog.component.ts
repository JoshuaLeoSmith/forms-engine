import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService, apiErrors } from '../../core/api.service';
import { apiBase } from '../../core/config';
import type { QuestionnaireDetail, SubmissionPolicy } from '../../core/models';

/**
 * Embed panel (FR-E-2): copy-ready snippets for plain HTML, React and
 * Angular, pre-filled with the publicId and backend base URL; plus the
 * questionnaire's allowed origins (FR-B-3) with an allow-all warning, and the
 * Phase-5 submission policy setting (FR5-4) with its honor-system caveat in
 * the help text.
 */
@Component({
  selector: 'app-embed-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Embed “{{ data.detail.name }}”</h2>
    <mat-dialog-content>
      @for (snippet of snippets; track snippet.label) {
        <div class="snippet">
          <div class="snippet-head">
            <strong>{{ snippet.label }}</strong>
            <button matButton (click)="copy(snippet.code)">
              <mat-icon>content_copy</mat-icon>
              Copy
            </button>
          </div>
          <pre>{{ snippet.code }}</pre>
        </div>
      }

      <h3>Allowed origins</h3>
      <p class="fe-muted">
        Origins allowed to load and submit this questionnaire, one per line
        (e.g. <code>https://app.example.com</code>).
      </p>
      @if (originList().length === 0) {
        <p class="fe-badge fe-badge-warn">
          <mat-icon>public</mat-icon>
          Empty list: any website may embed and submit this questionnaire.
        </p>
      }
      <mat-form-field appearance="outline" style="width: 100%;">
        <mat-label>Allowed origins</mat-label>
        <textarea matInput rows="3" [ngModel]="originsText()" (ngModelChange)="originsText.set($event)"></textarea>
      </mat-form-field>
      <button matButton="outlined" [disabled]="busy()" (click)="saveOrigins()">Save origins</button>

      <h3>Submission policy</h3>
      <p class="fe-muted">
        How repeat submissions from the same <code>external-ref</code> are handled. Pass the
        reference on the embed (e.g. <code>external-ref="user-4821"</code>) to identify the
        respondent in your own terms.
      </p>
      <mat-form-field appearance="outline" style="width: 100%;">
        <mat-label>Submission policy</mat-label>
        <mat-select [ngModel]="policy()" (ngModelChange)="policy.set($event)">
          <mat-option value="MULTIPLE">Multiple — anyone can submit any number of times</mat-option>
          <mat-option value="ONE_PER_REF">One per reference — one completed response per external-ref</mat-option>
        </mat-select>
      </mat-form-field>
      @if (policy() === 'ONE_PER_REF') {
        <p class="fe-badge fe-badge-warn policy-note">
          <mat-icon>info</mat-icon>
          Honor-system deduplication: the reference comes from your page's markup, so anyone
          editing the page can change it. Good for cooperative users (e.g. logged-in users of
          your own app); not suitable for contests, votes, or any adversarial setting.
        </p>
        <p class="fe-muted">
          Embeds without an <code>external-ref</code> will show a configuration error instead of
          the form — deliberately, so a missing reference fails on your first test.
        </p>
      }
      <button matButton="outlined" [disabled]="busy()" (click)="savePolicy()">Save policy</button>

      <h3>Address autocomplete (geocoding)</h3>
      <p class="fe-muted">
        Address questions use the backend's geocode proxy, which defaults to Photon's public
        instance (<code>photon.komoot.io</code>) — a fair-use community service, fine for
        evaluation. <strong>Self-host Photon for production traffic</strong> and point
        <code>PHOTON_BASE_URL</code> at it (see the README for a Docker snippet).
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .snippet {
      margin-bottom: 16px;
    }
    .snippet-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    pre {
      background: var(--mat-sys-surface-container, #f2f4f7);
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      overflow: auto;
      margin: 4px 0 0;
    }
    h3 {
      margin: 16px 0 4px;
    }
    .policy-note {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      line-height: 1.4;
    }
  `,
})
export class EmbedDialogComponent {
  protected readonly data = inject<{ detail: QuestionnaireDetail }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EmbedDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly busy = signal(false);
  protected readonly originsText = signal(this.data.detail.allowedOrigins.join('\n'));
  protected readonly policy = signal<SubmissionPolicy>(this.data.detail.submissionPolicy ?? 'MULTIPLE');

  protected originList(): string[] {
    return this.originsText()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  protected readonly snippets = buildSnippets(this.data.detail.publicId);

  protected copy(code: string): void {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      this.snackBar.open('Clipboard access is unavailable', 'Dismiss');
      return;
    }

    void clipboard.writeText(code).then(
      () => this.snackBar.open('Copied to clipboard', undefined, { duration: 1500 }),
      () => this.snackBar.open('Could not copy to clipboard', 'Dismiss'),
    );
  }

  protected async saveOrigins(): Promise<void> {
    this.busy.set(true);
    try {
      const detail = await this.api.setAllowedOrigins(this.data.detail.id, this.originList());
      this.snackBar.open('Allowed origins saved', undefined, { duration: 1500 });
      this.data.detail.allowedOrigins = detail.allowedOrigins;
    } catch (err) {
      this.snackBar.open(apiErrors(err).join('; '), 'Dismiss');
    } finally {
      this.busy.set(false);
    }
  }

  /** FR5-4: persists the submission policy; enforcement is server-side. */
  protected async savePolicy(): Promise<void> {
    this.busy.set(true);
    try {
      const detail = await this.api.setSubmissionPolicy(this.data.detail.id, this.policy());
      this.snackBar.open('Submission policy saved', undefined, { duration: 1500 });
      this.data.detail.submissionPolicy = detail.submissionPolicy;
    } catch (err) {
      this.snackBar.open(apiErrors(err).join('; '), 'Dismiss');
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * ⚠ The plain-HTML snippet is kept in sync with examples/plain-html/index.html
 * (FR6-4) — that file is the canonical copy-source and is what the Playwright
 * suite runs against. If the mounting markup changes here, change it there too.
 */
function buildSnippets(publicId: string): { label: string; code: string }[] {
  const base = apiBase();
  return [
    {
      label: 'Plain HTML',
      code: `<!-- Or self-host: copy packages/renderer/dist/forms-engine.esm.js next to your page. -->
<script type="module" src="https://unpkg.com/@forms-engine/renderer/dist/forms-engine.esm.js"></script>
<forms-engine
  public-id="${publicId}"
  api-base="${base}">
</forms-engine>`,
    },
    {
      label: 'React',
      code: `import { FormsEngine } from '@forms-engine/react';

export function Questionnaire() {
  return (
    <FormsEngine
      publicId="${publicId}"
      apiBase="${base}"
      onCompleted={({ responseId }) => console.log('done', responseId)}
    />
  );
}`,
    },
    {
      label: 'Angular',
      code: `import { FormsEngineComponent } from '@forms-engine/angular';

@Component({
  imports: [FormsEngineComponent],
  template: \`
    <forms-engine-embed
      publicId="${publicId}"
      apiBase="${base}"
      (completed)="onCompleted($event)" />
  \`,
})
export class QuestionnairePage {
  onCompleted(event: { responseId: string }) {}
}`,
    },
  ];
}
