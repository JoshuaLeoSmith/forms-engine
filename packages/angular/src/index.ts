/**
 * @forms-engine/angular — thin Angular wrapper for the <forms-engine> web
 * component (FR-P-2). All logic lives in the core component; this only
 * translates inputs and DOM events (BRD §8).
 */
import { Component, CUSTOM_ELEMENTS_SCHEMA, input, output } from '@angular/core';
import '@forms-engine/renderer';

export interface FormsEngineLoaded {
  publicId: string;
  versionNumber: number;
}

export interface FormsEngineScreenChange {
  stepId: string;
  tabId: string;
}

export interface FormsEngineCompleted {
  responseId: string;
}

export interface FormsEngineError {
  message: string;
  cause?: unknown;
}

export interface FormsEngineResumed {
  responseId: string;
  /** `stepId|tabId` key of the screen the session resumed on (null before the first screen). */
  screenId: string | null;
  stepId?: string;
  tabId?: string;
}

export interface FormsEngineAlreadySubmitted {
  externalRef: string;
}

@Component({
  selector: 'forms-engine-embed',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <forms-engine
      [attr.public-id]="publicId()"
      [attr.api-base]="apiBase()"
      [attr.theme]="theme() || null"
      [attr.external-ref]="externalRef() || null"
      (fe-loaded)="loaded.emit(asDetail($event))"
      (fe-screen-changed)="screenChanged.emit(asDetail($event))"
      (fe-completed)="completed.emit(asDetail($event))"
      (fe-resumed)="resumed.emit(asDetail($event))"
      (fe-already-submitted)="alreadySubmitted.emit(asDetail($event))"
      (fe-error)="errored.emit(asDetail($event))"
    ></forms-engine>
  `,
})
export class FormsEngineComponent {
  /** The questionnaire's stable public id (FR-L-1). */
  readonly publicId = input.required<string>();
  /** Base URL of the self-hosted Forms-Engine backend. */
  readonly apiBase = input.required<string>();
  /** Reserved; v1 ships one default theme themable via CSS custom properties. */
  readonly theme = input<string>('');
  /**
   * Opaque external reference identifying the respondent in your own terms
   * (Phase 5 FR5-1). Honor-system only — spoofable by anyone with devtools.
   */
  readonly externalRef = input<string>('');

  readonly loaded = output<FormsEngineLoaded>();
  readonly screenChanged = output<FormsEngineScreenChange>();
  readonly completed = output<FormsEngineCompleted>();
  /** Fired when a refreshed session resumes where it left off (FR4-4). */
  readonly resumed = output<FormsEngineResumed>();
  /** Fired when this reference has already completed the form (FR5-11). */
  readonly alreadySubmitted = output<FormsEngineAlreadySubmitted>();
  readonly errored = output<FormsEngineError>();

  protected asDetail<T>(event: Event): T {
    return (event as CustomEvent).detail as T;
  }
}
