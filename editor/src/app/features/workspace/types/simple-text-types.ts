import { Component, input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { QuestionDef } from '../../../core/models';

/** EMAIL / PHONE have no typeConfig (Phase 2 §6.6) — the panel says so. */
@Component({
  selector: 'app-no-config',
  template: `<p class="hint">No configuration needed — validation is built in.</p>`,
  styles: `
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
  `,
})
export class NoConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();
}

/** Inert preview of an EMAIL question (FR2-17). */
@Component({
  selector: 'app-email-preview',
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" style="width: 100%;">
      <mat-label>{{ question().prompt }}</mat-label>
      <input matInput disabled placeholder="name@example.com" />
    </mat-form-field>
  `,
})
export class EmailPreviewComponent {
  readonly question = input.required<QuestionDef>();
}

/** Inert preview of a PHONE question (FR2-17). */
@Component({
  selector: 'app-phone-preview',
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" style="width: 100%;">
      <mat-label>{{ question().prompt }}</mat-label>
      <input matInput disabled placeholder="(555) 555-0100" />
    </mat-form-field>
  `,
})
export class PhonePreviewComponent {
  readonly question = input.required<QuestionDef>();
}
