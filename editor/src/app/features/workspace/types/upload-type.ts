import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  FILE_CATEGORIES,
  fileUploadConstraintSummary,
} from '@forms-engine/renderer/core';
import { ApiService } from '../../../core/api.service';
import type { QuestionDef } from '../../../core/models';

const CATEGORY_ORDER = Object.keys(FILE_CATEGORIES);

function categoryLabel(category: string): string {
  const name = category.charAt(0) + category.slice(1).toLowerCase();
  const extensions = (FILE_CATEGORIES[category] ?? []).map((e) => e.toUpperCase()).join(', ');
  return `${name} (${extensions})`;
}

/**
 * FILE_UPLOAD config panel (Phase 3 §5.2, FR3-15): category checkbox group
 * (≥ 1 enforced by the core validator), maxFiles stepper, max-file-size input
 * bounded by the env-tunable system cap (displayed), helper text.
 */
@Component({
  selector: 'app-file-upload-config',
  imports: [FormsModule, MatCheckboxModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="upload-config">
      <span class="group-label">Accepted file categories</span>
      <div class="categories">
        @for (category of categories; track category) {
          <mat-checkbox
            [checked]="isChecked(category)"
            (change)="toggleCategory(category, $event.checked)"
          >
            {{ label(category) }}
          </mat-checkbox>
        }
      </div>
      @if (selectedCount() === 0) {
        <p class="warn">Select at least one category.</p>
      }
      <p class="hint">
        The server verifies file <em>content</em>, not just the name — executables, scripts, HTML
        and SVG are never accepted.
      </p>
      <div class="numbers">
        <mat-form-field appearance="outline">
          <mat-label>Max files</mat-label>
          <input
            matInput
            type="number"
            min="1"
            max="10"
            [ngModel]="numberOf('maxFiles', 1)"
            (ngModelChange)="setNumber('maxFiles', $event)"
          />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Max size per file (MB)</mat-label>
          <input
            matInput
            type="number"
            min="1"
            [max]="systemCapMb()"
            [ngModel]="numberOf('maxFileSizeMb', 10)"
            (ngModelChange)="setNumber('maxFileSizeMb', $event)"
          />
          <mat-hint>System cap: {{ systemCapMb() }} MB</mat-hint>
        </mat-form-field>
      </div>
      <mat-form-field appearance="outline" class="helper">
        <mat-label>Helper text (optional)</mat-label>
        <input
          matInput
          maxlength="500"
          [ngModel]="helperText()"
          (ngModelChange)="setHelperText($event)"
          placeholder="e.g. PDF preferred, 10 MB max"
        />
      </mat-form-field>
    </div>
  `,
  styles: `
    .upload-config {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .group-label {
      font-size: 13px;
      font-weight: 500;
    }
    .categories {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      width: 100%;
    }
    .numbers {
      display: flex;
      gap: 12px;
    }
    .numbers mat-form-field {
      width: 180px;
    }
    .helper {
      width: 100%;
      max-width: 420px;
    }
    .warn {
      margin: 0;
      font-size: 12px;
      color: #c62828;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
    }
  `,
})
export class FileUploadConfigComponent {
  readonly config = input.required<Record<string, unknown>>();
  readonly onChange = input.required<(config: Record<string, unknown>) => void>();

  private readonly api = inject(ApiService);
  protected readonly categories = CATEGORY_ORDER;
  /** FR3-19 default until the backend answers; then the env-tuned truth. */
  protected readonly systemCapMb = signal(50);

  constructor() {
    void this.api
      .uploadsConfig()
      .then((cfg) => this.systemCapMb.set(cfg.maxFileSizeMb))
      .catch(() => {});
  }

  protected label(category: string): string {
    return categoryLabel(category);
  }

  private selected(): string[] {
    const raw = this.config()['allowedCategories'];
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  protected isChecked(category: string): boolean {
    return this.selected().includes(category);
  }

  protected selectedCount(): number {
    return this.selected().length;
  }

  protected toggleCategory(category: string, checked: boolean): void {
    const set = new Set(this.selected());
    if (checked) {
      set.add(category);
    } else {
      set.delete(category);
    }
    // Stored in the table's canonical order regardless of click order.
    const next = CATEGORY_ORDER.filter((c) => set.has(c));
    this.onChange()({ ...this.config(), allowedCategories: next });
  }

  protected numberOf(key: 'maxFiles' | 'maxFileSizeMb', fallback: number): number {
    const raw = this.config()[key];
    return typeof raw === 'number' ? raw : fallback;
  }

  protected setNumber(key: 'maxFiles' | 'maxFileSizeMb', value: unknown): void {
    const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
    this.onChange()({ ...this.config(), [key]: parsed ?? this.numberOf(key, key === 'maxFiles' ? 1 : 10) });
  }

  protected helperText(): string {
    const raw = this.config()['helperText'];
    return typeof raw === 'string' ? raw : '';
  }

  protected setHelperText(value: string): void {
    this.onChange()({ ...this.config(), helperText: value });
  }
}

/**
 * Inert preview of a FILE_UPLOAD question (FR3-16): the dropzone with the
 * configured helper text and constraint summary, non-functional.
 */
@Component({
  selector: 'app-file-upload-preview',
  imports: [],
  template: `
    <div class="upload-preview">
      <span class="prompt">{{ question().prompt }}</span>
      <div class="dropzone">
        <span class="title">Drag &amp; drop or click to browse</span>
        <span class="constraints">{{ summary() }}</span>
        @if (helperText()) {
          <span class="helper">{{ helperText() }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    .upload-preview {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .prompt {
      font-size: 14px;
    }
    .dropzone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 16px;
      border: 2px dashed var(--mat-sys-outline-variant, #c6cbd4);
      border-radius: 8px;
      color: var(--mat-sys-on-surface-variant, #5f6672);
      background: var(--mat-sys-surface-container-low, #f6f7f9);
    }
    .title {
      font-size: 13px;
      font-weight: 500;
    }
    .constraints,
    .helper {
      font-size: 12px;
    }
  `,
})
export class FileUploadPreviewComponent {
  readonly question = input.required<QuestionDef>();

  protected readonly summary = computed(() => fileUploadConstraintSummary(this.question().typeConfig));

  protected helperText(): string {
    const raw = this.question().typeConfig['helperText'];
    return typeof raw === 'string' ? raw : '';
  }
}
