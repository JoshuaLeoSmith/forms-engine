/**
 * Forms-Engine Angular example (FR6-6): mounts the wrapper from
 * @forms-engine/angular — the published-package surface only, nothing from
 * the editor — and logs every component event to the browser console.
 */
import { Component } from '@angular/core';
import { FormsEngineComponent } from '@forms-engine/angular';

// CONFIG (FR6-2) — the only two values to edit. Run `node ../seed/seed.mjs`
// to create the demo questionnaire and print the publicId to paste here.
const API_BASE = 'http://localhost:8080';
const PUBLIC_ID = 'q_xt0j8zbiix';

@Component({
  selector: 'app-root',
  imports: [FormsEngineComponent],
  template: `
    <forms-engine-embed
      [publicId]="publicId"
      [apiBase]="apiBase"
      [externalRef]="externalRef"
      (loaded)="log('fe-loaded', $event)"
      (screenChanged)="log('fe-screen-changed', $event)"
      (completed)="log('fe-completed', $event)"
      (resumed)="log('fe-resumed', $event)"
      (alreadySubmitted)="log('fe-already-submitted', $event)"
      (errored)="log('fe-error', $event)"
    />
  `,
})
export class App {
  protected readonly apiBase = API_BASE;
  protected readonly publicId = PUBLIC_ID;
  /** Your app's user id goes here. */
  protected readonly externalRef = 'user-4821';

  protected log(type: string, detail: unknown): void {
    console.log(type, detail);
  }
}
