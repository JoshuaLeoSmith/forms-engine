/**
 * <fe-upload> — internal dropzone control for FILE_UPLOAD questions
 * (Phase 3 §5.3, FR3-17/18/20). Renders in light DOM so the <forms-engine>
 * shadow stylesheet applies. Files upload immediately on selection with a
 * determinate progress bar and cancel; failures show an inline per-file error
 * with a user-triggered retry (never automatic — FR3-20); client pre-checks
 * (size, extension, remaining slots) give fast feedback but the server
 * re-verifies everything.
 */
import { html, LitElement, nothing, type TemplateResult } from 'lit';
import type { FileReference } from '../core/types.js';
import {
  fileUploadConstraintSummary,
  fileUploadExtensions,
  type FileUploadConfig,
} from '../core/registry.js';
import { defaultMessages, type LabelKey, type MessageResolver } from '../core/labels.js';
import { UploadAbortedError, type UploadHandle } from '../api/client.js';

/**
 * Host-provided upload plumbing. `upload` creates the response first if none
 * exists yet (FR3-8); `remove` is best-effort — the orphan cleanup job is the
 * safety net (FR3-10/11).
 */
export interface UploadContext {
  upload(file: File, onProgress: (fraction: number) => void): UploadHandle;
  remove(fileId: string): void;
  /**
   * Phase 4 FR4-7: true in the editor's draft preview — selections are kept
   * in-memory only and each row carries a "preview — not uploaded" tag.
   */
  preview?: boolean;
}

interface UploadTask {
  localId: number;
  file: File;
  progress: number;
  status: 'uploading' | 'error';
  message: string;
  /** False for pre-check failures — retrying an oversized file cannot help. */
  retryable: boolean;
  handle: UploadHandle | null;
}

let nextLocalId = 1;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

export class FeUploadElement extends LitElement {
  static override properties = {
    value: { attribute: false },
    config: { attribute: false },
    uploads: { attribute: false },
    messages: { attribute: false },
    disabled: { type: Boolean },
    invalid: { type: Boolean },
    groupId: { type: String, attribute: 'group-id' },
    _tasks: { state: true },
    _notice: { state: true },
    _dragOver: { state: true },
  };

  value: FileReference[] | null = null;
  config: Record<string, unknown> = {};
  uploads: UploadContext | null = null;
  /** Host-resolved strings (FR4-13); null = English defaults. */
  messages: MessageResolver | null = null;
  disabled = false;
  invalid = false;
  groupId = '';

  private msg(key: LabelKey, params?: Record<string, string | number>): string {
    return (this.messages ?? defaultMessages)(key, params);
  }

  private _tasks: UploadTask[] = [];
  private _notice = '';
  private _dragOver = false;
  private lastBusyCount = 0;

  /** Light DOM: styled by the host component's shadow stylesheet. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private refs(): FileReference[] {
    return Array.isArray(this.value) ? this.value : [];
  }

  private cfg(): FileUploadConfig {
    return this.config as unknown as FileUploadConfig;
  }

  private maxFiles(): number {
    const raw = this.cfg().maxFiles;
    return typeof raw === 'number' && raw >= 1 ? raw : 1;
  }

  private maxBytes(): number {
    const raw = this.cfg().maxFileSizeMb;
    return (typeof raw === 'number' && raw >= 1 ? raw : 10) * 1024 * 1024;
  }

  private uploadingCount(): number {
    return this._tasks.filter((t) => t.status === 'uploading').length;
  }

  private remainingSlots(): number {
    return this.maxFiles() - this.refs().length - this.uploadingCount();
  }

  /** Reports in-flight upload count so the host can gate navigation (FR3-18). */
  private syncBusy(): void {
    const count = this.uploadingCount();
    if (count !== this.lastBusyCount) {
      this.lastBusyCount = count;
      this.emit('fe-busy-change', { count });
    }
  }

  private mutateTasks(mutate: (tasks: UploadTask[]) => UploadTask[]): void {
    this._tasks = mutate([...this._tasks]);
    this.syncBusy();
  }

  // ---- selection & pre-checks (FR3-17) ------------------------------------

  private handleSelection(files: readonly File[]): void {
    if (this.disabled || this.uploads === null || files.length === 0) {
      return;
    }
    this._notice = '';
    const slots = this.remainingSlots();
    if (slots <= 0) {
      this._notice =
        this.maxFiles() === 1
          ? this.msg('uploadSingleAttached')
          : this.msg('uploadMaxFilesNotice', { n: this.maxFiles() });
      return;
    }
    const accepted = files.slice(0, slots);
    if (files.length > slots) {
      // Surplus beyond the remaining maxFiles slots is rejected with a message.
      this._notice = this.msg('uploadSurplusNotice', { n: slots });
    }
    const extensions = fileUploadExtensions(this.config);
    for (const file of accepted) {
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
      if (!extensions.includes(ext)) {
        this.addErrorTask(
          file,
          this.msg('uploadTypeNotAccepted', { extensions: extensions.map((e) => e.toUpperCase()).join(', ') }),
          false,
        );
        continue;
      }
      if (file.size > this.maxBytes()) {
        this.addErrorTask(file, this.msg('uploadTooLarge', { max: this.cfg().maxFileSizeMb }), false);
        continue;
      }
      this.startUpload({
        localId: nextLocalId++,
        file,
        progress: 0,
        status: 'uploading',
        message: '',
        retryable: true,
        handle: null,
      });
    }
  }

  private addErrorTask(file: File, message: string, retryable: boolean): void {
    this.mutateTasks((tasks) => [
      ...tasks,
      { localId: nextLocalId++, file, progress: 0, status: 'error', message, retryable, handle: null },
    ]);
  }

  // ---- upload lifecycle (immediate on selection, FR3-8/P3-D4) --------------

  private startUpload(task: UploadTask): void {
    const handle = this.uploads!.upload(task.file, (fraction) => {
      this.mutateTasks((tasks) =>
        tasks.map((t) => (t.localId === task.localId ? { ...t, progress: fraction } : t)),
      );
    });
    task.handle = handle;
    this.mutateTasks((tasks) => [...tasks.filter((t) => t.localId !== task.localId), task]);
    handle.promise.then(
      (ref) => {
        this.mutateTasks((tasks) => tasks.filter((t) => t.localId !== task.localId));
        const next = [...this.refs(), ref];
        this.value = next;
        this.emit('fe-change', { value: next });
      },
      (err) => {
        if (err instanceof UploadAbortedError) {
          // Cancelled uploads don't block and don't linger (FR3-18).
          this.mutateTasks((tasks) => tasks.filter((t) => t.localId !== task.localId));
          return;
        }
        const message = err instanceof Error && err.message ? err.message : this.msg('uploadFailed');
        this.mutateTasks((tasks) =>
          tasks.map((t) =>
            t.localId === task.localId ? { ...t, status: 'error' as const, message, retryable: true, handle: null } : t,
          ),
        );
        this.emit('fe-upload-error', { message });
      },
    );
  }

  private retry(task: UploadTask): void {
    if (this.uploads === null || task.status !== 'error' || !task.retryable) {
      return;
    }
    this.startUpload({ ...task, status: 'uploading', progress: 0, message: '' });
  }

  private cancel(task: UploadTask): void {
    task.handle?.abort();
  }

  private dismiss(task: UploadTask): void {
    this.mutateTasks((tasks) => tasks.filter((t) => t.localId !== task.localId));
  }

  /** Respondent removal (FR3-10): drop the reference, best-effort delete. */
  private removeRef(ref: FileReference): void {
    this.uploads?.remove(ref.fileId);
    const next = this.refs().filter((r) => r.fileId !== ref.fileId);
    this.value = next.length > 0 ? next : null;
    this._notice = '';
    this.emit('fe-change', { value: this.value });
  }

  // ---- dropzone interactions ----------------------------------------------

  private browse(): void {
    this.querySelector<HTMLInputElement>('.fe-upload-input')?.click();
  }

  private onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.handleSelection([...(input.files ?? [])]);
    input.value = '';
  }

  private onDragOver(event: DragEvent): void {
    if (this.disabled || this.remainingSlots() <= 0) {
      return;
    }
    event.preventDefault();
    this._dragOver = true;
  }

  private onDragLeave(): void {
    this._dragOver = false;
  }

  private onDrop(event: DragEvent): void {
    event.preventDefault();
    this._dragOver = false;
    if (this.disabled) {
      return;
    }
    this.handleSelection([...(event.dataTransfer?.files ?? [])]);
  }

  // ---- rendering -----------------------------------------------------------

  override render(): TemplateResult {
    const extensions = fileUploadExtensions(this.config);
    const accept = extensions.map((e) => `.${e}`).join(',');
    const helperText = typeof this.cfg().helperText === 'string' ? (this.cfg().helperText as string) : '';
    const full = this.remainingSlots() <= 0;
    const dropDisabled = this.disabled || this.uploads === null || full;
    return html`
      <div class="fe-upload">
        <input
          class="fe-upload-input fe-visually-hidden"
          type="file"
          accept=${accept || nothing}
          ?multiple=${this.maxFiles() > 1}
          ?disabled=${dropDisabled}
          tabindex="-1"
          aria-hidden="true"
          @change=${this.onInputChange}
        />
        <button
          type="button"
          id=${this.groupId || nothing}
          class="fe-dropzone ${this._dragOver ? 'fe-drag-over' : ''} ${this.invalid ? 'fe-invalid' : ''}"
          ?disabled=${dropDisabled}
          @click=${this.browse}
          @dragover=${this.onDragOver}
          @dragleave=${this.onDragLeave}
          @drop=${this.onDrop}
        >
          <span class="fe-dropzone-title">
            ${full ? this.msg('uploadLimitReached') : this.msg('uploadPrompt')}
          </span>
          <span class="fe-dropzone-constraints">
            ${fileUploadConstraintSummary(this.config, this.messages ?? defaultMessages)}
          </span>
          ${helperText ? html`<span class="fe-dropzone-helper">${helperText}</span>` : nothing}
        </button>
        ${this._notice ? html`<p class="fe-hint fe-upload-notice" role="status">${this._notice}</p>` : nothing}
        ${this.renderRows()}
      </div>
    `;
  }

  private renderRows(): TemplateResult | typeof nothing {
    const refs = this.refs();
    if (refs.length === 0 && this._tasks.length === 0) {
      return nothing;
    }
    return html`
      <ul class="fe-upload-list">
        ${refs.map(
          (ref) => html`
            <li class="fe-upload-row">
              <span class="fe-upload-name" title=${ref.fileName}>${ref.fileName}</span>
              <span class="fe-upload-size">${formatBytes(ref.size)}</span>
              ${this.uploads?.preview === true
                ? html`<span class="fe-upload-preview-tag">${this.msg('uploadPreviewTag')}</span>`
                : nothing}
              ${this.disabled
                ? nothing
                : html`<button
                    type="button"
                    class="fe-upload-remove"
                    aria-label=${this.msg('uploadRemoveLabel', { name: ref.fileName })}
                    @click=${() => this.removeRef(ref)}
                  >
                    ×
                  </button>`}
            </li>
          `,
        )}
        ${this._tasks.map((task) =>
          task.status === 'uploading'
            ? html`
                <li class="fe-upload-row fe-uploading">
                  <span class="fe-upload-name" title=${task.file.name}>${task.file.name}</span>
                  <span class="fe-upload-size">${formatBytes(task.file.size)}</span>
                  <span
                    class="fe-upload-progress"
                    role="progressbar"
                    aria-label=${this.msg('uploadUploadingLabel', { name: task.file.name })}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow=${Math.round(task.progress * 100)}
                  >
                    <span class="fe-upload-progress-bar" style=${`width:${Math.round(task.progress * 100)}%`}></span>
                  </span>
                  <button
                    type="button"
                    class="fe-upload-remove"
                    aria-label=${this.msg('uploadCancelLabel', { name: task.file.name })}
                    @click=${() => this.cancel(task)}
                  >
                    ×
                  </button>
                </li>
              `
            : html`
                <li class="fe-upload-row fe-upload-failed">
                  <span class="fe-upload-name" title=${task.file.name}>${task.file.name}</span>
                  <span class="fe-upload-error-message">${task.message}</span>
                  ${task.retryable
                    ? html`<button type="button" class="fe-upload-retry" @click=${() => this.retry(task)}>
                        ${this.msg('uploadRetry')}
                      </button>`
                    : nothing}
                  <button
                    type="button"
                    class="fe-upload-remove"
                    aria-label=${this.msg('uploadDismissLabel', { name: task.file.name })}
                    @click=${() => this.dismiss(task)}
                  >
                    ×
                  </button>
                </li>
              `,
        )}
      </ul>
    `;
  }
}

export function defineFeUpload(): void {
  if (!customElements.get('fe-upload')) {
    customElements.define('fe-upload', FeUploadElement);
  }
}
