import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import type { RuleConfig, StepDef, TabDef } from '../../core/models';
import { DraftStore } from './draft-store';
import { buildCodeInfo, RuleBuilderComponent, type CodeInfo } from './rule-builder.component';

export interface ContainerRulesDialogData {
  store: DraftStore;
  kind: 'STEP' | 'TAB';
  id: string;
}

/**
 * Visibility & requirement panels for steps and tabs (FR-E-10/11). The
 * requirement panel shows the cascade explanation (D-1).
 */
@Component({
  selector: 'app-container-rules-dialog',
  imports: [MatButtonModule, MatDialogModule, RuleBuilderComponent],
  template: `
    <h2 mat-dialog-title>
      {{ data.kind === 'STEP' ? 'Step' : 'Tab' }} rules — {{ title() }}
    </h2>
    <mat-dialog-content>
      <h3>Visibility</h3>
      <app-rule-builder
        aspect="visibility"
        [ownerKind]="data.kind"
        [config]="visibility()"
        [availableCodes]="availableCodes()"
        [codeInfo]="codeInfo()"
        [laterCodes]="laterCodes()"
        (configChange)="setVisibility($event)"
      />
      <h3>Requirement</h3>
      <app-rule-builder
        aspect="requirement"
        [ownerKind]="data.kind"
        [config]="requirement()"
        [availableCodes]="availableCodes()"
        [codeInfo]="codeInfo()"
        [laterCodes]="laterCodes()"
        (configChange)="setRequirement($event)"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="filled" mat-dialog-close>Done</button>
    </mat-dialog-actions>
  `,
  styles: `
    h3 {
      margin: 16px 0 8px;
      font-size: 14px;
    }
  `,
})
export class ContainerRulesDialogComponent {
  protected readonly data = inject<ContainerRulesDialogData>(MAT_DIALOG_DATA);

  private element(): StepDef | TabDef | undefined {
    const draft = this.data.store.draft();
    if (!draft) {
      return undefined;
    }
    if (this.data.kind === 'STEP') {
      return draft.steps.find((s) => s.id === this.data.id);
    }
    for (const step of draft.steps) {
      const tab = step.tabs.find((t) => t.id === this.data.id);
      if (tab) {
        return tab;
      }
    }
    return draft.tabs.find((t) => t.id === this.data.id);
  }

  protected readonly title = computed(() => this.element()?.title ?? '');
  protected readonly visibility = computed<RuleConfig>(
    () => this.element()?.visibility ?? { mode: 'ALWAYS' },
  );
  protected readonly requirement = computed<RuleConfig>(
    () => this.element()?.requirement ?? { mode: 'NEVER' },
  );

  /** For containers the requirement default is NEVER: map ALWAYS-checkbox semantics. */
  protected readonly availableCodes = computed(() => this.data.store.allCodes());

  protected readonly codeInfo = computed<Record<string, CodeInfo>>(() =>
    buildCodeInfo(this.data.store.norm()?.questions ?? []),
  );

  /** Codes inside or after this container count as "later" (forward-ref hint). */
  protected readonly laterCodes = computed<ReadonlySet<string>>(() => {
    const norm = this.data.store.norm();
    if (!norm) {
      return new Set();
    }
    const later = new Set<string>();
    let inside = false;
    for (const step of norm.steps) {
      for (const tab of step.tabs) {
        const isThis =
          (this.data.kind === 'STEP' && step.id === this.data.id) ||
          (this.data.kind === 'TAB' && tab.id === this.data.id);
        if (isThis) {
          inside = true;
        }
        if (inside) {
          tab.questions.forEach((q) => later.add(q.code));
        }
      }
    }
    return later;
  });

  private mutate(apply: (el: StepDef | TabDef) => void): void {
    this.data.store.update((draft) => {
      let el: StepDef | TabDef | undefined;
      if (this.data.kind === 'STEP') {
        el = draft.steps.find((s) => s.id === this.data.id);
      } else {
        el =
          draft.steps.flatMap((s) => s.tabs).find((t) => t.id === this.data.id) ??
          draft.tabs.find((t) => t.id === this.data.id);
      }
      if (el) {
        apply(el);
      }
    });
  }

  protected setVisibility(config: RuleConfig): void {
    this.mutate((el) => {
      el.visibility = config;
    });
  }

  protected setRequirement(config: RuleConfig): void {
    this.mutate((el) => {
      el.requirement = config;
    });
  }
}
