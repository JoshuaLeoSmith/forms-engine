#!/usr/bin/env node
/**
 * Seeds a running Forms-Engine backend with the shared demo questionnaire
 * (FR6-7): imports demo-questionnaire.json — a Phase-4 export file
 * (FR4-11/12) — via the management API, publishes the imported draft, and
 * prints the resulting publicId with next steps for each example.
 *
 * Zero dependencies; needs Node 18+ (global fetch).
 *
 *   node examples/seed/seed.mjs [--api-base http://localhost:8080]
 */
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const flagIndex = args.indexOf('--api-base');
const apiBase = (flagIndex >= 0 ? args[flagIndex + 1] : 'http://localhost:8080').replace(/\/+$/, '');

async function post(path, body) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    console.error(`Cannot reach ${apiBase} — is the backend running? (docker compose up)`);
    process.exit(1);
  }
  const text = await response.text();
  if (!response.ok) {
    console.error(`POST ${path} failed with ${response.status}:\n${text}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

const exportFile = await readFile(new URL('./demo-questionnaire.json', import.meta.url), 'utf8');
const imported = await post('/api/v1/questionnaires/import', exportFile);
const published = await post(
  `/api/v1/questionnaires/${imported.id}/publish`,
  JSON.stringify({ note: 'Seeded by examples/seed/seed.mjs' }),
);

console.log(`
Imported and published "${published.name}" (live = v${published.currentVersion}).

  publicId: ${published.publicId}

Next steps — paste the publicId into an example's config:

  plain-html:  examples/plain-html/index.html   (the public-id attribute)
  react:       examples/react/.env              (VITE_FE_PUBLIC_ID)
  angular:     examples/angular/src/app.ts      (the PUBLIC_ID constant)

Each example's README has the run commands; examples/README.md has the
one-time build step (npm install && npm run build at the repo root).
`);
