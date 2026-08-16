import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { Definition } from '../../core/models';
// Side effect: registers the <forms-engine> custom element. Deliberate
// dogfooding (FR4-5): the preview mounts the ACTUAL renderer, not a
// reimplementation — the editor is the embed's first consumer.
import '@forms-engine/renderer';

export interface PreviewOverlayData {
  definition: Definition;
  name: string;
}

/**
 * Draft preview overlay (FR4-5..8): full-screen, ESC-closable, mounting the
 * real web component in its in-memory `definition` mode (FR4-6) — gating,
 * rules, clearing cascades and validation run exactly as live, but nothing is
 * persisted. Reset (and reopening) starts clean against the current draft.
 */
@Component({
  selector: 'app-preview-overlay',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="preview-shell">
      <div class="preview-header">
        <mat-icon>visibility</mat-icon>
        <div class="titles">
          <span class="title">Preview — {{ data.name }}</span>
          <span class="note">
            In-memory test run: no responses are created and nothing is saved. File selections stay
            local — they are never uploaded, so server-side content checks don't run here.
          </span>
        </div>
        <span class="fe-spacer"></span>
        <button matButton (click)="reset()"><mat-icon>restart_alt</mat-icon>Reset</button>
        <button matButton="filled" mat-dialog-close>Close</button>
      </div>
      <div class="preview-body">
        <div #host class="preview-host"></div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .preview-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mat-sys-surface-container-low, #f6f7f9);
    }
    .preview-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: var(--mat-sys-surface, #fff);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #d4d8df);
    }
    .titles {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .title {
      font-weight: 600;
    }
    .note {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
    .preview-body {
      flex: 1;
      overflow: auto;
      padding: 24px;
    }
    .preview-host {
      max-width: 960px;
      margin: 0 auto;
    }
  `,
})
export class PreviewOverlayComponent implements AfterViewInit {
  protected readonly data = inject<PreviewOverlayData>(MAT_DIALOG_DATA);

  @ViewChild('host') private readonly host!: ElementRef<HTMLElement>;

  private engine: (HTMLElement & { definition: Definition | null }) | null = null;

  ngAfterViewInit(): void {
    const el = document.createElement('forms-engine') as HTMLElement & {
      definition: Definition | null;
    };
    el.definition = structuredClone(this.data.definition);
    this.host.nativeElement.appendChild(el);
    this.engine = el;
  }

  /** FR4-6: a fresh object identity restarts the preview from a clean slate. */
  protected reset(): void {
    if (this.engine) {
      this.engine.definition = structuredClone(this.data.definition);
    }
  }
}
