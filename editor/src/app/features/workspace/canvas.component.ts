import { NgComponentOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { groupSections, type QuestionDef } from '../../core/models';
import { DraftStore } from './draft-store';
import { answerShape, findIncompatibleRefs, findRuleRefs } from './impact';
import { ImpactDialogComponent, type ImpactDialogData } from './impact-dialog.component';
import { QuestionDialogComponent, type QuestionDialogData } from './question-dialog.component';
import { buildCodeInfo, type CodeInfo } from './rule-builder.component';
import { getEditorQuestionType } from './types/editor-type-registry';

/**
 * Editor canvas (FR-E-5): renders the selected screen exactly as the live
 * renderer would — same section-card grouping, widths, and inputs — with all
 * inputs inert and per-question overlay controls. No rules are evaluated here.
 */
@Component({
  selector: 'app-canvas',
  imports: [NgComponentOutlet, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (sections(); as sectionList) {
      @for (section of sectionList; track $index) {
        <section class="fe-card section">
          @if (section.title) {
            <h3 class="section-title">{{ section.title }}</h3>
          }
          <div class="section-grid">
            @for (question of section.questions; track question.id) {
              <div
                class="question"
                [class.width-half]="question.width === 'HALF'"
                [class.width-full]="question.width === 'FULL'"
              >
                <div class="question-head">
                  <code class="code">{{ question.code || 'display text' }}</code>
                  @if (question.visibility.mode === 'CONDITIONAL') {
                    <span class="fe-badge" matTooltip="Shown conditionally (rules)">
                      <mat-icon>visibility</mat-icon>rule
                    </span>
                  }
                  @if (question.visibility.mode === 'NEVER') {
                    <span class="fe-badge fe-badge-warn" matTooltip="This will never be shown">
                      <mat-icon>visibility_off</mat-icon>never shown
                    </span>
                  }
                  @if (question.requirement.mode === 'CONDITIONAL') {
                    <span class="fe-badge" matTooltip="Required conditionally (rules)">
                      <mat-icon>priority_high</mat-icon>req rule
                    </span>
                  }
                  @if (question.requirement.mode === 'ALWAYS') {
                    <span class="required-star" matTooltip="Always required">*</span>
                  }
                  <span class="fe-spacer"></span>
                  <span class="controls">
                    <button matIconButton aria-label="Move question up" (click)="move(question, -1)">
                      <mat-icon>arrow_upward</mat-icon>
                    </button>
                    <button matIconButton aria-label="Move question down" (click)="move(question, 1)">
                      <mat-icon>arrow_downward</mat-icon>
                    </button>
                    <button matIconButton aria-label="Edit question" (click)="edit(question)">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button matIconButton aria-label="Delete question" (click)="remove(question)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </span>
                </div>
                <div class="preview" aria-hidden="true">
                  @if (previewComponent(question); as preview) {
                    <ng-container *ngComponentOutlet="preview; inputs: { question }" />
                  } @else {
                    <p class="fe-muted">Unknown question type: {{ question.type }}</p>
                  }
                </div>
              </div>
            }
          </div>
        </section>
      }
      @if (sectionList.length === 0) {
        <div class="fe-card empty">
          <p class="fe-muted">No questions on this screen yet.</p>
        </div>
      }
      <div class="add-row">
        <button
          matButton="filled"
          [disabled]="!store.canAddQuestionHere().ok"
          [matTooltip]="store.canAddQuestionHere().reason ?? ''"
          (click)="add()"
        >
          <mat-icon>add</mat-icon>
          Add question
        </button>
      </div>
    }
  `,
  styles: `
    .section {
      margin-bottom: 16px;
    }
    .section-title {
      margin: 0 0 12px;
      font-size: 15px;
    }
    .section-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 16px;
    }
    .question {
      grid-column: span 1;
      border: 1px dashed transparent;
      border-radius: 8px;
      padding: 6px;
    }
    .question:hover {
      border-color: var(--mat-sys-outline-variant, #d4d8df);
      background: var(--mat-sys-surface-container-low, #fafbfc);
    }
    .question.width-full {
      grid-column: span 2;
    }
    .question-head {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
    }
    .code {
      font-size: 12px;
      background: var(--mat-sys-surface-container, #f2f4f7);
      border-radius: 4px;
      padding: 2px 6px;
    }
    .required-star {
      color: var(--mat-sys-error, #c62828);
      font-weight: 700;
    }
    .controls {
      opacity: 0;
      transition: opacity 0.15s;
    }
    .question:hover .controls,
    .question:focus-within .controls {
      opacity: 1;
    }
    .preview {
      pointer-events: none;
    }
    .empty {
      text-align: center;
      padding: 32px;
    }
    .add-row {
      display: flex;
      justify-content: center;
      margin-top: 8px;
    }
  `,
})
export class CanvasComponent {
  protected readonly store = inject(DraftStore);
  private readonly dialog = inject(MatDialog);

  protected readonly sections = computed(() => {
    const screen = this.store.currentScreen();
    return screen ? groupSections(screen.tab.questions) : null;
  });

  protected previewComponent(question: QuestionDef) {
    return getEditorQuestionType(question.type)?.preview ?? null;
  }

  protected move(question: QuestionDef, direction: -1 | 1): void {
    this.store.moveQuestion(question.id, direction);
  }

  private codeInfo(): Record<string, CodeInfo> {
    return buildCodeInfo(this.store.norm()?.questions ?? []);
  }

  private dialogData(question?: QuestionDef): QuestionDialogData {
    const ordered = (this.store.norm()?.questions ?? []).map((q) => q.code).filter(Boolean);
    const screenQuestions = this.store.currentScreen()?.tab.questions ?? [];
    let laterCodes: string[];
    if (question) {
      const index = ordered.indexOf(question.code);
      laterCodes = index >= 0 ? ordered.slice(index + 1) : [];
    } else {
      const last = screenQuestions[screenQuestions.length - 1];
      const index = last ? ordered.indexOf(last.code) : ordered.length - 1;
      laterCodes = ordered.slice(index + 1);
    }
    const sectionTitles = [...new Set(screenQuestions.map((q) => q.sectionTitle).filter(Boolean))];
    return {
      question,
      existingCodes: this.store.allCodes(),
      sectionTitles,
      codeInfo: this.codeInfo(),
      laterCodes,
      defaultSection: screenQuestions[screenQuestions.length - 1]?.sectionTitle ?? '',
    };
  }

  protected add(): void {
    this.dialog
      .open(QuestionDialogComponent, { data: this.dialogData(), width: '860px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((result?: QuestionDef) => {
        if (result) {
          this.store.addQuestion(result);
        }
        void this.store.flush();
      });
  }

  protected edit(question: QuestionDef): void {
    this.dialog
      .open(QuestionDialogComponent, {
        data: this.dialogData(question),
        width: '860px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((result?: QuestionDef) => {
        if (!result) {
          void this.store.flush();
          return;
        }
        if (result.type !== question.type) {
          this.confirmTypeChange(question, result);
        } else if (result.code !== question.code && question.code) {
          this.confirmRename(question, result);
        } else {
          this.store.updateQuestion(result, question.code);
          void this.store.flush();
        }
      });
  }

  /**
   * FR2-15: changing a question's type fires the rename-grade impact modal
   * when the answer shape changes or existing rule conditions become invalid
   * (per the §4.2 matrix). Affected conditions are removed with FR-E-14
   * fail-open behavior.
   */
  private confirmTypeChange(original: QuestionDef, result: QuestionDef): void {
    const draft = this.store.draft();
    const refCode = original.code || result.code;
    const refs = draft && refCode ? findIncompatibleRefs(draft, refCode, result) : [];
    const shapeChanged = answerShape(original.type) !== answerShape(result.type);
    if (refs.length === 0 && !shapeChanged) {
      this.store.updateQuestion(result, original.code, original.type);
      void this.store.flush();
      return;
    }
    const items = refs.map((ref) => {
      const removal = `${ref.aspect === 'visibility' ? 'Visibility' : 'Requirement'} rule on ${ref.ownerLabel}: ${ref.matchingConditions === 1 ? 'a condition referencing' : `${ref.matchingConditions} conditions referencing`} \`${refCode}\` ${ref.matchingConditions === 1 ? 'is' : 'are'} no longer valid for the new type and will be removed.`;
      if (!ref.failsOpen) {
        return removal;
      }
      const consequence =
        ref.aspect === 'visibility'
          ? `${ref.ownerLabel} will become always visible.`
          : ref.ownerType === 'QUESTION'
            ? `${ref.ownerLabel} will become always required.`
            : `${ref.ownerLabel} will no longer require its questions.`;
      return `${removal} That was the rule's last condition, so ${consequence}`;
    });
    this.dialog
      .open(ImpactDialogComponent, {
        width: '560px',
        data: {
          title: `Change \`${refCode}\` to ${result.type}?`,
          severity:
            'Changing the question type alters the answer shape. Historical responses keep their old-shaped values under this code; rule conditions the new type cannot satisfy are removed, and rules left empty fail open.',
          items,
          confirmLabel: 'Change type',
        } satisfies ImpactDialogData,
      })
      .afterClosed()
      .subscribe((confirmed?: boolean) => {
        if (confirmed) {
          this.store.updateQuestion(result, original.code, original.type);
        }
        void this.store.flush();
      });
  }

  /** FR-E-13: rename impact modal — references are atomically updated (D-2). */
  private confirmRename(original: QuestionDef, result: QuestionDef): void {
    const draft = this.store.draft();
    const refs = draft ? findRuleRefs(draft, original.code) : [];
    const items = refs.map(
      (ref) =>
        `${ref.aspect === 'visibility' ? 'Visibility' : 'Requirement'} rule on ${ref.ownerLabel} references \`${original.code}\` — the reference will be updated to \`${result.code}\`.`,
    );
    this.dialog
      .open(ImpactDialogComponent, {
        width: '560px',
        data: {
          title: `Rename \`${original.code}\` to \`${result.code}\`?`,
          severity:
            'The question code is the key in submitted data and in rules. Historical responses keep the old key; only the version pinned to each response makes them interpretable.',
          items,
          confirmLabel: 'Rename and update references',
        } satisfies ImpactDialogData,
      })
      .afterClosed()
      .subscribe((confirmed?: boolean) => {
        if (confirmed) {
          this.store.updateQuestion(result, original.code);
        }
        void this.store.flush();
      });
  }

  /** FR-E-14: delete impact modal — conditions removed, rules fail open (D-2b). */
  protected remove(question: QuestionDef): void {
    const draft = this.store.draft();
    const refs =
      draft && question.code ? findRuleRefs(draft, question.code, new Set([question.id])) : [];
    const items = refs.map((ref) => {
      const removal = `${ref.aspect === 'visibility' ? 'Visibility' : 'Requirement'} rule on ${ref.ownerLabel}: the condition referencing \`${question.code}\` will be removed.`;
      if (!ref.failsOpen) {
        return removal;
      }
      const consequence =
        ref.aspect === 'visibility'
          ? `${ref.ownerLabel} will become always visible.`
          : ref.ownerType === 'QUESTION'
            ? `${ref.ownerLabel} will become always required.`
            : `${ref.ownerLabel} will no longer require its questions.`;
      return `${removal} That was the rule's last condition, so ${consequence}`;
    });
    this.dialog
      .open(ImpactDialogComponent, {
        width: '560px',
        data: {
          title: question.code ? `Delete question \`${question.code}\`?` : 'Delete this display text?',
          severity:
            'Deleting a question removes it from the draft. Conditions referencing it are removed from other rules; rules left empty fail open. Historical responses keep their submitted answers.',
          items,
          confirmLabel: 'Delete question',
          danger: true,
        } satisfies ImpactDialogData,
      })
      .afterClosed()
      .subscribe((confirmed?: boolean) => {
        if (confirmed) {
          this.store.deleteQuestion(question.id);
        }
        void this.store.flush();
      });
  }
}
