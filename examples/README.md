# Examples

Minimal integration examples for the three supported embedding surfaces.
They are deliberately tiny — each mounts the questionnaire, logs the
component's events (`fe-loaded`, `fe-screen-changed`, `fe-completed`,
`fe-error`, `fe-resumed`, `fe-already-submitted`) to the browser console, and
nothing else (FR6-1). They live in-repo because they exercise the public
embedding contract: a pull request that breaks that contract fails the
[examples CI job](../.github/workflows/examples.yml) (FR6-9), and the
Playwright end-to-end suite runs against `plain-html` — the tested artifact
and the copied artifact are the same file (FR6-10).

Full showcase applications are out of scope here by policy (Phase-6 BRD §1);
they belong in a separate repository pinned to published npm versions.

| Example | Stack | Config point |
|---|---|---|
| [`plain-html/`](plain-html/) | One HTML file, no build | `public-id` / `api-base` attributes in `index.html` |
| [`react/`](react/) | Vite + React | [`react/.env`](react/.env) |
| [`angular/`](angular/) | Standalone-component Angular | `PUBLIC_ID` / `API_BASE` constants in [`angular/src/app.ts`](angular/src/app.ts) |

Inside this monorepo the React and Angular examples resolve `@forms-engine/*`
via npm workspace references so CI always builds them against the current
source; outside it you'd `npm install @forms-engine/react` (or
`@forms-engine/angular`) — the code is identical either way; only dependency
resolution differs (FR6-3).

## Running them

Examples are worthless against an empty backend, so seed it first:

```bash
# 1. Start the stack (backend on :8080)
docker compose up --build

# 2. Once: install and build the workspace packages
npm install && npm run build

# 3. Create + publish the shared demo questionnaire (FR6-7)
node examples/seed/seed.mjs          # prints a publicId
```

The seed script imports [`seed/demo-questionnaire.json`](seed/demo-questionnaire.json)
— a Phase-4 export file, maintained by re-exporting from any editor — via the
management import endpoint, publishes it, and prints copy-paste next steps.
The demo questionnaire is a trimmed acceptance-walkthrough form: two steps,
a required text box (gating), and a dessert radio whose visibility rule fires
when a toggle flips (FR6-8). It has no upload question on purpose, so it runs
against storage-less dev backends (P6-D3).

Then paste the printed `publicId` into the example's config point (table
above) and follow the example's own README:

- **plain-html** — serve the repo root with any static server
  (`npx serve .`) and open `/examples/plain-html/`.
- **react** — `npm run dev` in `examples/react` (http://localhost:5173).
- **angular** — `npm start` in `examples/angular` (http://localhost:4200).

## StackBlitz (coming soon)

StackBlitz cannot reach a localhost backend, so these links go live only once
a public demo instance exists (FR6-11) — the config constants above are what
get swapped to point at it. Until then:

<!--
- React example: https://stackblitz.com/github/<org>/forms-engine/tree/main/examples/react
- Plain-HTML example: https://stackblitz.com/github/<org>/forms-engine/tree/main/examples/plain-html
-->
