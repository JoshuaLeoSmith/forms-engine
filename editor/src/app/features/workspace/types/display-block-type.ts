import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { renderMarkdown } from '@forms-engine/renderer/core';
import type { QuestionDef } from '../../../core/models';

/**
 * DISPLAY_BLOCK config panel (Phase 2 §6.9): the content textarea with a
 * write/preview toggle. The preview binds ONLY the output of the shared
 * renderMarkdown sanitizer (escape-first, fixed tag set) — identical to what
 * the live renderer shows.
 */
@Component({
  selector: 'app-display-block-config',
  imports: [FormsModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="display-config">
      <mat-button-toggle-group [value]="mode()" (change)="mode.set($event.value)" aria-label="Editor mode">
        <mat-button-toggle value="write">Write</mat-button-toggle>
        <mat-button-toggle value="preview">Preview</mat-button-toggle>
      </mat-button-toggle-group>
      @if (mode() === 'write') {
        <mat-form-field appearance="outline" class="wide" subscriptSizing="dynamic">
          <mat-label>Content</mat-label>
          <textarea
            matInput
            rows="8"
            [ngModel]="content"
            (ngModelChange)="setContent($event)"
          ></textarea>
          <mat-hint>Supports **bold**, *italic*, [links](https://…), lists and line breaks. No HTML.</mat-hint>
        </mat-form-field>
      } @else {
        <div class="markdown-preview fe-card" [innerHTML]="rendered()"></div>
      }
    </div>
  `,
  styles: `
    .display-config {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .wide {
      width: 100%;
    }
    .markdown-preview {
      width: 100%;
      min-height: 120px;
      font-size: 14px;
      padding: 12px;
    }
  `,
})
export class DisplayBlockConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();

  private readonly sanitizer = inject(DomSanitizer);
  protected readonly mode = signal<'write' | 'preview'>('write');

  protected get content(): string {
    return (this.config()['content'] as string) ?? '';
  }

  protected rendered(): SafeHtml {
    // renderMarkdown escapes all input first and emits a fixed tag set — safe
    // by construction; bypass only marks OUR sanitizer's output as trusted.
    return this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(this.content));
  }

  protected setContent(content: string): void {
    this.onChange()({ ...this.config(), content });
  }
}

/** Inert preview of a DISPLAY_BLOCK in the canvas (FR2-17): the rendered content. */
@Component({
  selector: 'app-display-block-preview',
  template: `<div class="display-block" [innerHTML]="rendered()"></div>`,
  styles: `
    .display-block {
      font-size: 14px;
      line-height: 1.55;
    }
    .display-block p {
      margin: 0 0 0.6em;
    }
  `,
})
export class DisplayBlockPreviewComponent {
  readonly question = input.required<QuestionDef>();

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly rendered = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      renderMarkdown((this.question().typeConfig['content'] as string) ?? ''),
    ),
  );
}
