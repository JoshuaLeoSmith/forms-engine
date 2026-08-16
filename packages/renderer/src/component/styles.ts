import { css } from 'lit';

/**
 * Shadow-DOM-encapsulated default theme (NFR-1). Every design token is a CSS
 * custom property so the host page can theme without piercing the shadow root.
 */
export const formsEngineStyles = css`
  :host {
    --fe-font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --fe-color-text: #1f2430;
    --fe-color-muted: #5f6672;
    --fe-color-primary: #3f51b5;
    --fe-color-primary-contrast: #ffffff;
    --fe-color-surface: #ffffff;
    --fe-color-background: #f6f7f9;
    --fe-color-border: #d4d8df;
    --fe-color-error: #c62828;
    --fe-color-success: #2e7d32;
    --fe-radius: 8px;
    --fe-spacing: 16px;
    --fe-max-width: 960px;

    display: block;
    font-family: var(--fe-font-family);
    color: var(--fe-color-text);
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .fe-root {
    max-width: var(--fe-max-width);
    margin: 0 auto;
  }

  /* ---- stepper -------------------------------------------------------- */
  .fe-stepper {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0;
    margin: 0 0 var(--fe-spacing);
    list-style: none;
    counter-reset: fe-step;
  }
  .fe-stepper li {
    display: flex;
  }
  .fe-step-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    background: none;
    font: inherit;
    color: var(--fe-color-muted);
    padding: 8px 12px;
    border-radius: var(--fe-radius);
    cursor: pointer;
  }
  .fe-step-button .fe-step-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--fe-color-border);
    color: var(--fe-color-text);
    font-size: 0.85em;
  }
  .fe-step-button[aria-current='step'] {
    color: var(--fe-color-text);
    font-weight: 600;
  }
  .fe-step-button[aria-current='step'] .fe-step-index {
    background: var(--fe-color-primary);
    color: var(--fe-color-primary-contrast);
  }
  .fe-step-button.fe-visited:not([aria-current='step']) .fe-step-index {
    background: color-mix(in srgb, var(--fe-color-primary) 25%, white);
  }
  .fe-step-button[disabled] {
    cursor: default;
    opacity: 0.55;
  }
  .fe-step-button:not([disabled]):hover {
    background: var(--fe-color-background);
  }

  /* ---- layout: tab rail + screen -------------------------------------- */
  .fe-body {
    display: flex;
    gap: var(--fe-spacing);
    align-items: flex-start;
  }
  .fe-tab-rail {
    flex: 0 0 200px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .fe-tab-button {
    display: block;
    width: 100%;
    text-align: left;
    border: 0;
    border-left: 3px solid transparent;
    background: none;
    font: inherit;
    color: var(--fe-color-muted);
    padding: 10px 12px;
    border-radius: 0 var(--fe-radius) var(--fe-radius) 0;
    cursor: pointer;
  }
  .fe-tab-button[aria-current='true'] {
    border-left-color: var(--fe-color-primary);
    color: var(--fe-color-text);
    font-weight: 600;
    background: var(--fe-color-background);
  }
  .fe-tab-button[disabled] {
    cursor: default;
    opacity: 0.55;
  }
  .fe-tab-button:not([disabled]):hover {
    background: var(--fe-color-background);
  }
  .fe-screen {
    flex: 1;
    min-width: 0;
  }

  /* ---- section cards --------------------------------------------------- */
  .fe-section {
    background: var(--fe-color-surface);
    border: 1px solid var(--fe-color-border);
    border-radius: var(--fe-radius);
    padding: var(--fe-spacing);
    margin-bottom: var(--fe-spacing);
  }
  .fe-section-title {
    margin: 0 0 var(--fe-spacing);
    font-size: 1.05rem;
    font-weight: 600;
  }
  .fe-section-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--fe-spacing);
  }
  /* DEFAULT flows responsively (two columns when space allows); HALF forces
     half-width; FULL forces a full row (§5.2). */
  .fe-question {
    grid-column: span 1;
  }
  .fe-question.fe-width-full {
    grid-column: span 2;
  }
  @media (max-width: 640px) {
    .fe-body {
      flex-direction: column;
    }
    .fe-tab-rail {
      flex-direction: row;
      flex-wrap: wrap;
      flex-basis: auto;
    }
    .fe-question:not(.fe-width-half) {
      grid-column: span 2;
    }
  }

  /* ---- fields ----------------------------------------------------------- */
  .fe-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .fe-label {
    font-size: 0.92rem;
    font-weight: 500;
  }
  .fe-required-marker {
    color: var(--fe-color-error);
    margin-left: 2px;
  }
  .fe-input {
    font: inherit;
    color: inherit;
    background: var(--fe-color-surface);
    border: 1px solid var(--fe-color-border);
    border-radius: calc(var(--fe-radius) / 2);
    padding: 10px 12px;
    width: 100%;
  }
  .fe-input-small {
    max-width: 220px;
  }
  .fe-textarea {
    resize: vertical;
  }
  .fe-input:focus-visible,
  .fe-step-button:focus-visible,
  .fe-tab-button:focus-visible,
  .fe-nav-button:focus-visible,
  .fe-select-trigger:focus-visible,
  .fe-date-toggle:focus-visible,
  .fe-choice-option input:focus-visible {
    outline: 2px solid var(--fe-color-primary);
    outline-offset: 2px;
  }
  .fe-input.fe-invalid {
    border-color: var(--fe-color-error);
  }
  .fe-choice-group.fe-invalid,
  .fe-address-group.fe-invalid {
    border-left: 3px solid var(--fe-color-error);
    padding-left: 10px;
  }
  .fe-choice-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    cursor: pointer;
  }
  .fe-choice-option.fe-choice-disabled {
    opacity: 0.55;
    cursor: default;
  }
  .fe-error-message {
    color: var(--fe-color-error);
    font-size: 0.85rem;
    margin: 0;
  }
  .fe-hint {
    color: var(--fe-color-muted);
    font-size: 0.82rem;
    margin: 0;
  }
  .fe-char-counter {
    color: var(--fe-color-muted);
    font-size: 0.78rem;
    align-self: flex-end;
  }
  .fe-sublabel {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--fe-color-muted);
  }
  .fe-fallback {
    border: 1px dashed var(--fe-color-border);
    border-radius: var(--fe-radius);
    padding: 12px;
    color: var(--fe-color-muted);
    font-size: 0.9rem;
  }

  /* ---- number adornments ------------------------------------------------ */
  .fe-adorned {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--fe-color-border);
    border-radius: calc(var(--fe-radius) / 2);
    background: var(--fe-color-surface);
  }
  .fe-adorned.fe-invalid {
    border-color: var(--fe-color-error);
  }
  .fe-adorned .fe-input {
    border: 0;
    background: transparent;
    flex: 1;
    min-width: 0;
  }
  .fe-adornment {
    color: var(--fe-color-muted);
    padding: 0 10px;
  }

  /* ---- toggle ------------------------------------------------------------ */
  .fe-toggle {
    display: inline-flex;
    border: 1px solid var(--fe-color-border);
    border-radius: var(--fe-radius);
    overflow: hidden;
    width: fit-content;
  }
  .fe-toggle.fe-invalid {
    border-color: var(--fe-color-error);
  }
  .fe-toggle-option {
    font: inherit;
    border: 0;
    background: var(--fe-color-surface);
    color: var(--fe-color-text);
    padding: 8px 20px;
    cursor: pointer;
  }
  .fe-toggle-option + .fe-toggle-option {
    border-left: 1px solid var(--fe-color-border);
  }
  .fe-toggle-option.fe-selected {
    background: var(--fe-color-primary);
    color: var(--fe-color-primary-contrast);
  }
  .fe-toggle-option:focus-visible {
    outline: 2px solid var(--fe-color-primary);
    outline-offset: -2px;
  }

  /* ---- fe-select --------------------------------------------------------- */
  .fe-select {
    position: relative;
    display: block;
  }
  .fe-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    text-align: left;
    cursor: pointer;
  }
  .fe-select-trigger.fe-placeholder .fe-select-value {
    color: var(--fe-color-muted);
  }
  .fe-select-caret {
    color: var(--fe-color-muted);
    font-size: 0.8em;
  }
  .fe-select-clear {
    position: absolute;
    top: 50%;
    right: 34px;
    transform: translateY(-50%);
    border: 0;
    background: none;
    font: inherit;
    font-size: 1.05rem;
    color: var(--fe-color-muted);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 50%;
  }
  .fe-select-clear:hover {
    background: var(--fe-color-background);
    color: var(--fe-color-text);
  }
  .fe-select-popup {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--fe-color-surface);
    border: 1px solid var(--fe-color-border);
    border-radius: var(--fe-radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
    padding: 8px;
  }
  .fe-select-search {
    margin-bottom: 6px;
    padding: 8px 10px;
  }
  .fe-select-options {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
  }
  .fe-select-option {
    padding: 8px 10px;
    border-radius: calc(var(--fe-radius) / 2);
    cursor: pointer;
  }
  .fe-select-option.fe-active {
    background: var(--fe-color-background);
  }
  .fe-select-option[aria-selected='true'] {
    font-weight: 600;
    color: var(--fe-color-primary);
  }
  .fe-select-empty {
    padding: 8px 10px;
    color: var(--fe-color-muted);
  }

  /* ---- date input & calendar --------------------------------------------- */
  .fe-date {
    position: relative;
  }
  .fe-date-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .fe-date-text {
    flex: 1;
    min-width: 0;
  }
  .fe-date-toggle {
    font: inherit;
    border: 1px solid var(--fe-color-border);
    border-radius: calc(var(--fe-radius) / 2);
    background: var(--fe-color-surface);
    padding: 8px 10px;
    cursor: pointer;
    line-height: 1;
  }
  .fe-cal {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    background: var(--fe-color-surface);
    border: 1px solid var(--fe-color-border);
    border-radius: var(--fe-radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
    padding: 10px;
    min-width: 264px;
  }
  .fe-cal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .fe-cal-title {
    font-weight: 600;
    font-size: 0.92rem;
  }
  .fe-cal-nav {
    font: inherit;
    border: 0;
    background: none;
    padding: 4px 10px;
    border-radius: calc(var(--fe-radius) / 2);
    cursor: pointer;
    color: var(--fe-color-text);
  }
  .fe-cal-nav:hover {
    background: var(--fe-color-background);
  }
  .fe-cal-grid {
    border-collapse: collapse;
    width: 100%;
  }
  .fe-cal-grid th {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--fe-color-muted);
    padding: 2px;
  }
  .fe-cal-grid td {
    padding: 1px;
    text-align: center;
  }
  .fe-cal-day {
    font: inherit;
    font-size: 0.85rem;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--fe-color-text);
    cursor: pointer;
  }
  .fe-cal-day:not([disabled]):hover {
    background: var(--fe-color-background);
  }
  .fe-cal-day.fe-today {
    box-shadow: inset 0 0 0 1px var(--fe-color-border);
  }
  .fe-cal-day.fe-selected {
    background: var(--fe-color-primary);
    color: var(--fe-color-primary-contrast);
  }
  .fe-cal-day[disabled] {
    color: var(--fe-color-border);
    cursor: default;
  }
  .fe-cal-day:focus-visible {
    outline: 2px solid var(--fe-color-primary);
    outline-offset: 1px;
  }

  /* ---- address ------------------------------------------------------------ */
  .fe-address {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .fe-addr-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
    min-width: 0;
  }
  .fe-addr-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .fe-addr-grid .fe-addr-half {
    grid-column: span 1;
  }
  @media (max-width: 520px) {
    .fe-addr-grid {
      grid-template-columns: 1fr;
    }
  }
  .fe-suggestions {
    position: absolute;
    z-index: 30;
    top: 100%;
    left: 0;
    right: 0;
    margin: 4px 0 0;
    padding: 4px;
    list-style: none;
    background: var(--fe-color-surface);
    border: 1px solid var(--fe-color-border);
    border-radius: var(--fe-radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
    max-height: 220px;
    overflow-y: auto;
  }
  .fe-suggestion {
    padding: 8px 10px;
    border-radius: calc(var(--fe-radius) / 2);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .fe-suggestion.fe-active {
    background: var(--fe-color-background);
  }

  /* ---- display block ------------------------------------------------------ */
  .fe-display-block {
    font-size: 0.95rem;
    line-height: 1.55;
  }
  .fe-display-block p {
    margin: 0 0 0.6em;
  }
  .fe-display-block p:last-child {
    margin-bottom: 0;
  }
  .fe-display-block ul,
  .fe-display-block ol {
    margin: 0 0 0.6em;
    padding-left: 1.4em;
  }
  .fe-display-block a {
    color: var(--fe-color-primary);
  }

  /* ---- file upload (Phase 3 §5.3) ---------------------------------------- */
  .fe-upload {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fe-dropzone {
    font: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 18px 16px;
    border: 2px dashed var(--fe-color-border);
    border-radius: var(--fe-radius);
    background: var(--fe-color-background);
    color: var(--fe-color-text);
    cursor: pointer;
    text-align: center;
  }
  .fe-dropzone:hover:not(:disabled),
  .fe-dropzone.fe-drag-over {
    border-color: var(--fe-color-primary);
    background: color-mix(in srgb, var(--fe-color-primary) 6%, var(--fe-color-background));
  }
  .fe-dropzone:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
  .fe-dropzone.fe-invalid {
    border-color: var(--fe-color-error);
  }
  .fe-dropzone-title {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .fe-dropzone-constraints {
    font-size: 0.8rem;
    color: var(--fe-color-muted);
  }
  .fe-dropzone-helper {
    font-size: 0.85rem;
    color: var(--fe-color-muted);
  }
  .fe-upload-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fe-upload-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid var(--fe-color-border);
    border-radius: var(--fe-radius);
    background: var(--fe-color-surface);
    font-size: 0.9rem;
  }
  .fe-upload-row.fe-upload-failed {
    border-color: var(--fe-color-error);
  }
  .fe-upload-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fe-upload-size {
    color: var(--fe-color-muted);
    font-size: 0.8rem;
    flex: none;
  }
  .fe-upload-preview-tag {
    color: var(--fe-color-muted);
    font-size: 0.75rem;
    font-style: italic;
    border: 1px dashed var(--fe-color-border);
    border-radius: 999px;
    padding: 1px 8px;
    flex: none;
  }
  .fe-upload-progress {
    flex: 0 0 90px;
    height: 6px;
    border-radius: 3px;
    background: var(--fe-color-background);
    border: 1px solid var(--fe-color-border);
    overflow: hidden;
  }
  .fe-upload-progress-bar {
    display: block;
    height: 100%;
    background: var(--fe-color-primary);
    transition: width 0.15s ease;
  }
  .fe-upload-error-message {
    flex: 1 1 auto;
    color: var(--fe-color-error);
    font-size: 0.85rem;
  }
  .fe-upload-retry {
    font: inherit;
    font-size: 0.85rem;
    border: 1px solid var(--fe-color-border);
    border-radius: calc(var(--fe-radius) / 2);
    background: var(--fe-color-surface);
    padding: 4px 10px;
    cursor: pointer;
  }
  .fe-upload-remove {
    font: inherit;
    font-size: 1rem;
    line-height: 1;
    border: none;
    background: none;
    color: var(--fe-color-muted);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: calc(var(--fe-radius) / 2);
  }
  .fe-upload-remove:hover {
    color: var(--fe-color-error);
    background: var(--fe-color-background);
  }
  .fe-upload-notice {
    margin: 0;
  }

  /* ---- navigation footer ------------------------------------------------ */
  .fe-nav {
    display: flex;
    justify-content: space-between;
    gap: var(--fe-spacing);
    margin-top: var(--fe-spacing);
  }
  .fe-nav-button {
    font: inherit;
    border-radius: var(--fe-radius);
    border: 1px solid var(--fe-color-border);
    background: var(--fe-color-surface);
    color: var(--fe-color-text);
    padding: 10px 20px;
    cursor: pointer;
  }
  .fe-nav-button.fe-primary {
    background: var(--fe-color-primary);
    border-color: var(--fe-color-primary);
    color: var(--fe-color-primary-contrast);
  }
  .fe-nav-button:hover {
    filter: brightness(0.96);
  }

  /* ---- states ----------------------------------------------------------- */
  .fe-banner {
    border-radius: var(--fe-radius);
    padding: 12px 16px;
    margin-bottom: var(--fe-spacing);
    font-size: 0.9rem;
  }
  .fe-banner-error {
    background: color-mix(in srgb, var(--fe-color-error) 10%, white);
    border: 1px solid var(--fe-color-error);
    color: var(--fe-color-error);
  }
  .fe-state {
    background: var(--fe-color-surface);
    border: 1px solid var(--fe-color-border);
    border-radius: var(--fe-radius);
    padding: calc(var(--fe-spacing) * 2);
    text-align: center;
    color: var(--fe-color-muted);
  }
  .fe-state h2 {
    color: var(--fe-color-text);
    margin: 0 0 8px;
  }
  .fe-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
`;
