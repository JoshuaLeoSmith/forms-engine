/**
 * Runtime configuration. `public/config.js` (loaded before the app bundle)
 * sets `window.FE_API_BASE`; Docker overrides that file via environment
 * variables (FR-P-1). Defaults suit local development.
 */
declare global {
  interface Window {
    FE_API_BASE?: string;
  }
}

export function apiBase(): string {
  return (window.FE_API_BASE ?? 'http://localhost:8080').replace(/\/+$/, '');
}
