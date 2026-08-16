import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  SYNTHETIC_STEP_ID,
  syntheticTabId,
  type NormalizedStep,
  type NormalizedTab,
  type QuestionnaireDetail,
  type StepDef,
  type TabDef,
} from '../../core/models';
import { CanvasComponent } from './canvas.component';
import { DraftStore } from './draft-store';
import { EmbedDialogComponent } from './embed-dialog.component';
import { HistoryDialogComponent } from './history-dialog.component';
import { containedCodes, findRuleRefs, subtreeIds, summarizeContents } from './impact';
import { ImpactDialogComponent, type ImpactDialogData } from './impact-dialog.component';
import { PublishDialogComponent } from './publish-dialog.component';
import { PreviewOverlayComponent, type PreviewOverlayData } from './preview-overlay.component';

/**
 * Questionnaire workspace (FR-E-3..6, FR-E-12, FR-E-15..18): header with
 * status chip and publish/history, stepper across the top, tab rail on the
 * left, inert preview canvas in the middle.
 */
@Component({
  selector: 'app-workspace',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatToolbarModule,
    MatTooltipModule,
    CanvasComponent,
  ],
  providers: [DraftStore],
  template: `
    <mat-toolbar>
      <button matIconButton routerLink="/" aria-label="Back to questionnaires">
        <mat-icon>arrow_back</mat-icon>
      </button>
      @if (store.detail(); as detail) {
        <span class="name">{{ detail.name }}</span>
        @if (detail.currentVersion === 0) {
          <span class="fe-badge fe-badge-warn">never published</span>
        } @else if (detail.hasUnpublishedChanges) {
          <span class="fe-badge fe-badge-warn">Unpublished changes</span>
        } @else {
          <span class="fe-badge">Live = v{{ detail.currentVersion }}</span>
        }
        <span class="save-state fe-muted">
          @switch (store.saveState()) {
            @case ('pending') { Saving… }
            @case ('saving') { Saving… }
            @case ('error') { <span class="save-error">Draft not saved — retrying on next change</span> }
            @default { Saved }
          }
        </span>
        <span class="fe-spacer"></span>
        <button matButton (click)="openPreview()"><mat-icon>visibility</mat-icon>Preview</button>
        <button matButton [routerLink]="['/q', detail.id, 'responses']"><mat-icon>table_rows</mat-icon>Responses</button>
        <button matButton (click)="openEmbed()"><mat-icon>code</mat-icon>Embed</button>
        <button matButton (click)="openHistory()"><mat-icon>history</mat-icon>Version history</button>
        <button matButton="filled" (click)="openPublish()"><mat-icon>publish</mat-icon>Publish changes</button>
      }
    </mat-toolbar>

    @if (store.draft(); as draft) {
      <div class="fe-page workspace">
        <!-- Stepper row (steps mode) -->
        <div class="stepper-row">
          @for (step of realSteps(); track step.id; let i = $index) {
            <div class="step-item" [class.active]="isCurrentStep(step.id)">
              <button class="step-select" (click)="selectStep(step.id)">
                <span class="step-index">{{ i + 1 }}</span>
                @if (editingStepId() === step.id) {
                  <input
                    class="inline-edit"
                    [ngModel]="step.title"
                    (ngModelChange)="pendingTitle.set($event)"
                    (blur)="commitStepRename(step.id)"
                    (keyup.enter)="commitStepRename(step.id)"
                  />
                } @else {
                  <span>{{ step.title }}</span>
                }
                @if (hasConditionalRules(step)) {
                  <mat-icon class="rule-icon" matTooltip="This step has conditional rules">alt_route</mat-icon>
                }
                @if (step.visibility.mode === 'NEVER') {
                  <mat-icon class="warn-icon" matTooltip="This step will never be shown">visibility_off</mat-icon>
                }
              </button>
              <button matIconButton [matMenuTriggerFor]="stepMenu" aria-label="Step actions">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #stepMenu="matMenu">
                <button mat-menu-item (click)="startStepRename(step)"><mat-icon>edit</mat-icon>Rename</button>
                <button mat-menu-item (click)="editStepRules(step.id)"><mat-icon>alt_route</mat-icon>Visibility &amp; requirement…</button>
                <button mat-menu-item [disabled]="i === 0" (click)="store.moveStep(step.id, -1)"><mat-icon>arrow_back</mat-icon>Move left</button>
                <button mat-menu-item [disabled]="i === realSteps().length - 1" (click)="store.moveStep(step.id, 1)"><mat-icon>arrow_forward</mat-icon>Move right</button>
                <button
                  mat-menu-item
                  [disabled]="!store.canAddTabToStep(step.id).ok"
                  [matTooltip]="store.canAddTabToStep(step.id).reason ?? ''"
                  (click)="addTab(step.id)"
                >
                  <mat-icon>tab</mat-icon>Add tab
                </button>
                <button mat-menu-item (click)="deleteStep(step.id)"><mat-icon>delete</mat-icon>Delete step</button>
              </mat-menu>
            </div>
          }
          <span
            [matTooltip]="store.canAddStep().reason ?? ''"
          >
            <button matButton [disabled]="!store.canAddStep().ok" (click)="addStep()">
              <mat-icon>add</mat-icon>
              Add step
            </button>
          </span>
          @if (draft.steps.length === 0) {
            <span [matTooltip]="store.canAddTopLevelTab().reason ?? ''">
              <button matButton [disabled]="!store.canAddTopLevelTab().ok" (click)="addTab(null)">
                <mat-icon>tab</mat-icon>
                Add tab
              </button>
            </span>
          }
        </div>

        <div class="body">
          <!-- Tab rail for the current step (or top-level tabs) -->
          @if (railTabs(); as tabs) {
            @if (tabs.length > 0) {
              <nav class="tab-rail" aria-label="Tabs">
                @for (tab of tabs; track tab.id; let i = $index) {
                  <div class="tab-item" [class.active]="isCurrentTab(tab.id)">
                    <button class="tab-select" (click)="selectTab(tab.id)">
                      @if (editingTabId() === tab.id) {
                        <input
                          class="inline-edit"
                          [ngModel]="tab.title"
                          (ngModelChange)="pendingTitle.set($event)"
                          (blur)="commitTabRename(tab.id)"
                          (keyup.enter)="commitTabRename(tab.id)"
                        />
                      } @else {
                        <span>{{ tab.title }}</span>
                      }
                      @if (hasConditionalRules(tab)) {
                        <mat-icon class="rule-icon" matTooltip="This tab has conditional rules">alt_route</mat-icon>
                      }
                      @if (tab.visibility.mode === 'NEVER') {
                        <mat-icon class="warn-icon" matTooltip="This tab will never be shown">visibility_off</mat-icon>
                      }
                    </button>
                    <button matIconButton [matMenuTriggerFor]="tabMenu" aria-label="Tab actions">
                      <mat-icon>more_vert</mat-icon>
                    </button>
                    <mat-menu #tabMenu="matMenu">
                      <button mat-menu-item (click)="startTabRename(tab)"><mat-icon>edit</mat-icon>Rename</button>
                      <button mat-menu-item (click)="editTabRules(tab.id)"><mat-icon>alt_route</mat-icon>Visibility &amp; requirement…</button>
                      <button mat-menu-item [disabled]="i === 0" (click)="moveTab(tab.id, -1)"><mat-icon>arrow_upward</mat-icon>Move up</button>
                      <button mat-menu-item [disabled]="i === tabs.length - 1" (click)="moveTab(tab.id, 1)"><mat-icon>arrow_downward</mat-icon>Move down</button>
                      <button mat-menu-item (click)="deleteTab(tab.id)"><mat-icon>delete</mat-icon>Delete tab</button>
                    </mat-menu>
                  </div>
                }
                @if (currentRealStepId(); as stepId) {
                  <span [matTooltip]="store.canAddTabToStep(stepId).reason ?? ''">
                    <button matButton [disabled]="!store.canAddTabToStep(stepId).ok" (click)="addTab(stepId)">
                      <mat-icon>add</mat-icon>
                      Add tab
                    </button>
                  </span>
                } @else if (draft.tabs.length > 0) {
                  <button matButton (click)="addTab(null)"><mat-icon>add</mat-icon>Add tab</button>
                }
              </nav>
            }
          }

          <div class="canvas">
            <app-canvas />
          </div>
        </div>
      </div>
    } @else {
      <div class="fe-page"><p class="fe-muted">Loading…</p></div>
    }
  `,
  styles: `
    mat-toolbar {
      background: var(--mat-sys-surface, #fff);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #d4d8df);
      gap: 10px;
    }
    .name {
      font-weight: 600;
      margin-right: 4px;
    }
    .save-state {
      font-size: 12px;
    }
    .save-error {
      color: var(--mat-sys-error, #c62828);
    }
    .workspace {
      padding-top: 16px;
    }
    .stepper-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 16px;
    }
    .step-item {
      display: flex;
      align-items: center;
      border-radius: 8px;
    }
    .step-item.active {
      background: color-mix(in srgb, var(--mat-sys-primary, #3f51b5) 10%, white);
    }
    .step-select {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 0;
      background: none;
      font: inherit;
      padding: 8px 4px 8px 10px;
      cursor: pointer;
    }
    .step-index {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--mat-sys-primary, #3f51b5);
      color: #fff;
      font-size: 12px;
    }
    .body {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .tab-rail {
      flex: 0 0 220px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tab-item {
      display: flex;
      align-items: center;
      border-left: 3px solid transparent;
      border-radius: 0 8px 8px 0;
    }
    .tab-item.active {
      border-left-color: var(--mat-sys-primary, #3f51b5);
      background: color-mix(in srgb, var(--mat-sys-primary, #3f51b5) 8%, white);
    }
    .tab-select {
      flex: 1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-align: left;
      border: 0;
      background: none;
      font: inherit;
      padding: 10px 4px 10px 12px;
      cursor: pointer;
    }
    .canvas {
      flex: 1;
      min-width: 0;
    }
    .rule-icon,
    .warn-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .rule-icon {
      color: var(--mat-sys-primary, #3f51b5);
    }
    .warn-icon {
      color: #b26a00;
    }
    .inline-edit {
      font: inherit;
      border: 1px solid var(--mat-sys-primary, #3f51b5);
      border-radius: 4px;
      padding: 2px 6px;
      width: 140px;
    }
  `,
})
export class WorkspacePage implements OnInit, OnDestroy {
  protected readonly store = inject(DraftStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly editingStepId = signal<string | null>(null);
  protected readonly editingTabId = signal<string | null>(null);
  protected readonly pendingTitle = signal('');

  private readonly beforeUnload = () => void this.store.flush();

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    void this.store.load(id).catch(() => {
      this.snackBar.open('Could not load this questionnaire.', 'Dismiss');
    });
    window.addEventListener('beforeunload', this.beforeUnload);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnload);
    void this.store.flush();
  }

  // ---- structure helpers ---------------------------------------------------

  protected realSteps(): StepDef[] {
    return this.store.draft()?.steps ?? [];
  }

  protected hasConditionalRules(el: { visibility: { mode: string }; requirement: { mode: string } }): boolean {
    return el.visibility.mode === 'CONDITIONAL' || el.requirement.mode === 'CONDITIONAL';
  }

  protected isCurrentStep(stepId: string): boolean {
    return this.store.currentScreen()?.step.id === stepId;
  }

  protected isCurrentTab(tabId: string): boolean {
    return this.store.currentScreen()?.tab.id === tabId;
  }

  protected currentRealStepId(): string | null {
    const step = this.store.currentScreen()?.step;
    return step && !step.synthetic && step.tabs.some((t) => !t.synthetic) ? step.id : null;
  }

  /** Real tabs shown in the rail: the current step's tabs, or top-level tabs. */
  protected railTabs(): TabDef[] {
    const draft = this.store.draft();
    if (!draft) {
      return [];
    }
    if (draft.tabs.length > 0) {
      return draft.tabs;
    }
    const stepId = this.store.currentScreen()?.step.id;
    return draft.steps.find((s) => s.id === stepId)?.tabs ?? [];
  }

  protected selectStep(stepId: string): void {
    const step = this.store.draft()?.steps.find((s) => s.id === stepId);
    if (!step) {
      return;
    }
    const tabId = step.tabs.length > 0 ? step.tabs[0].id : syntheticTabId(stepId);
    this.store.selection.set({ stepId, tabId });
  }

  protected selectTab(tabId: string): void {
    const draft = this.store.draft();
    if (!draft) {
      return;
    }
    if (draft.tabs.some((t) => t.id === tabId)) {
      this.store.selection.set({ stepId: SYNTHETIC_STEP_ID, tabId });
      return;
    }
    const stepId = this.store.currentScreen()?.step.id;
    if (stepId) {
      this.store.selection.set({ stepId, tabId });
    }
  }

  private tabOwnerStepId(tabId: string): string | null {
    const draft = this.store.draft();
    if (!draft || draft.tabs.some((t) => t.id === tabId)) {
      return null;
    }
    return draft.steps.find((s) => s.tabs.some((t) => t.id === tabId))?.id ?? null;
  }

  // ---- add / rename / move / delete ---------------------------------------

  protected addStep(): void {
    this.store.addStep(`Step ${this.realSteps().length + 1}`);
  }

  protected addTab(stepId: string | null): void {
    const count = stepId
      ? (this.store.draft()?.steps.find((s) => s.id === stepId)?.tabs.length ?? 0)
      : (this.store.draft()?.tabs.length ?? 0);
    this.store.addTab(stepId, `Tab ${count + 1}`);
  }

  protected startStepRename(step: StepDef): void {
    this.pendingTitle.set(step.title);
    this.editingStepId.set(step.id);
  }

  protected commitStepRename(stepId: string): void {
    if (this.editingStepId() !== stepId) {
      return;
    }
    const title = this.pendingTitle().trim();
    if (title) {
      this.store.renameStep(stepId, title);
    }
    this.editingStepId.set(null);
  }

  protected startTabRename(tab: TabDef): void {
    this.pendingTitle.set(tab.title);
    this.editingTabId.set(tab.id);
  }

  protected commitTabRename(tabId: string): void {
    if (this.editingTabId() !== tabId) {
      return;
    }
    const title = this.pendingTitle().trim();
    if (title) {
      this.store.renameTab(this.tabOwnerStepId(tabId), tabId, title);
    }
    this.editingTabId.set(null);
  }

  protected moveTab(tabId: string, direction: -1 | 1): void {
    this.store.moveTab(this.tabOwnerStepId(tabId), tabId, direction);
  }

  /** FR-E-6: delete warns with a content summary plus rule impact per code. */
  protected deleteStep(stepId: string): void {
    const step = this.store.draft()?.steps.find((s) => s.id === stepId);
    if (!step) {
      return;
    }
    this.confirmContainerDelete(
      `Delete ${step.title || 'this step'}?`,
      step,
      () => this.store.deleteStep(stepId),
    );
  }

  protected deleteTab(tabId: string): void {
    const ownerStepId = this.tabOwnerStepId(tabId);
    const draft = this.store.draft();
    const tab = ownerStepId
      ? draft?.steps.find((s) => s.id === ownerStepId)?.tabs.find((t) => t.id === tabId)
      : draft?.tabs.find((t) => t.id === tabId);
    if (!tab) {
      return;
    }
    this.confirmContainerDelete(
      `Delete ${tab.title || 'this tab'}?`,
      tab,
      () => this.store.deleteTab(ownerStepId, tabId),
    );
  }

  private confirmContainerDelete(title: string, element: StepDef | TabDef, apply: () => void): void {
    const draft = this.store.draft()!;
    const summary = summarizeContents(element);
    const parts: string[] = [];
    if (summary.tabs > 0) {
      parts.push(`${summary.tabs} tab${summary.tabs === 1 ? '' : 's'}`);
    }
    parts.push(`${summary.questions} question${summary.questions === 1 ? '' : 's'}`);
    const codes = containedCodes(element);
    const excludeIds = subtreeIds(element);
    const items: string[] = [];
    for (const code of codes) {
      for (const ref of findRuleRefs(draft, code, excludeIds)) {
        const removal = `${ref.aspect === 'visibility' ? 'Visibility' : 'Requirement'} rule on ${ref.ownerLabel}: the condition referencing \`${code}\` will be removed.`;
        items.push(ref.failsOpen ? `${removal} That was the rule's last condition, so it fails open.` : removal);
      }
    }
    this.dialog
      .open(ImpactDialogComponent, {
        width: '560px',
        data: {
          title,
          intro: `This deletes ${parts.join(' and ')}.`,
          severity:
            'Question codes inside are load-bearing: conditions referencing them elsewhere are removed, and rules left empty fail open. Historical responses are unaffected.',
          items,
          confirmLabel: 'Delete',
          danger: true,
        } satisfies ImpactDialogData,
      })
      .afterClosed()
      .subscribe((confirmed?: boolean) => {
        if (confirmed) {
          apply();
          void this.store.flush();
        }
      });
  }

  // ---- container rules -----------------------------------------------------

  protected editStepRules(stepId: string): void {
    void import('./container-rules-dialog.component').then(({ ContainerRulesDialogComponent }) => {
      this.dialog
        .open(ContainerRulesDialogComponent, {
          width: '720px',
          data: { store: this.store, kind: 'STEP', id: stepId },
        })
        .afterClosed()
        .subscribe(() => void this.store.flush());
    });
  }

  protected editTabRules(tabId: string): void {
    void import('./container-rules-dialog.component').then(({ ContainerRulesDialogComponent }) => {
      this.dialog
        .open(ContainerRulesDialogComponent, {
          width: '720px',
          data: { store: this.store, kind: 'TAB', id: tabId },
        })
        .afterClosed()
        .subscribe(() => void this.store.flush());
    });
  }

  // ---- header actions ------------------------------------------------------

  protected openPublish(): void {
    void this.store.flush().then(() => {
      const detail = this.store.detail();
      if (!detail) {
        return;
      }
      this.dialog
        .open(PublishDialogComponent, { width: '520px', data: { detail } })
        .afterClosed()
        .subscribe((updated?: QuestionnaireDetail) => {
          if (updated) {
            this.store.adopt(updated);
            this.snackBar.open(`Published v${updated.currentVersion}`, undefined, { duration: 2000 });
          }
        });
    });
  }

  protected openHistory(): void {
    const detail = this.store.detail();
    if (!detail) {
      return;
    }
    this.dialog
      .open(HistoryDialogComponent, { width: '720px', data: { detail } })
      .afterClosed()
      .subscribe((restored?: QuestionnaireDetail) => {
        if (restored) {
          this.store.adopt(restored);
          this.snackBar.open('Version restored to draft', undefined, { duration: 2000 });
        }
      });
  }

  protected openEmbed(): void {
    const detail = this.store.detail();
    if (!detail) {
      return;
    }
    this.dialog.open(EmbedDialogComponent, { width: '720px', data: { detail } });
  }

  /**
   * FR4-5: full-screen overlay mounting the real renderer against the current
   * draft. Each open (and Reset inside) starts clean at the first screen; no
   * responses or uploads are ever created (FR4-6/7).
   */
  protected openPreview(): void {
    const draft = this.store.draft();
    const detail = this.store.detail();
    if (!draft || !detail) {
      return;
    }
    this.dialog.open(PreviewOverlayComponent, {
      width: '100vw',
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      panelClass: 'fe-preview-panel',
      data: { definition: structuredClone(draft), name: detail.name } satisfies PreviewOverlayData,
    });
  }
}
