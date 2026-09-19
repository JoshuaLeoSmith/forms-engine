# Contributing to Forms-Engine

Thanks for your interest! A few ground rules keep review fast and the project
healthy.

## Before you open a pull request

1. **Comment on the issue first.** Say you'd like to take it and, for anything
   non-trivial, sketch your approach. Wait for a maintainer reply before
   starting — this avoids duplicate work and lets design constraints surface
   early. **Pull requests that appear without a prior comment on the issue may
   be closed.**
2. **No issue yet?** Open one describing the bug or proposal before writing
   code.

## Pull requests must come from a human

Every pull request needs a human author who has read the issue, understands
the change, has run it locally, and can discuss it in review. Using AI tools
to help you write code is fine — this project does too (see the
[AI disclaimer](README.md#ai-disclaimer)) — but you are accountable for every
line you submit.

**Pull requests opened by autonomous agents or automated accounts will be
closed without review.**

## What a good pull request looks like

- **Small and focused** — one issue per PR, no drive-by refactors.
- **Tested** — add or update tests for the behavior you change, and say in
  the PR description what you ran.
- **Green locally** for the area you touched:
  - packages: `npm install && npm run build && npm test` at the repo root
    (plus `npm run build:examples` if you touch the renderer's or wrappers'
    public surface — CI builds the examples against your change)
  - editor: `cd editor && npm install && npm test -- --watch=false`
  - backend: `cd backend && ./mvnw test` (Java 21)
  - end-to-end (optional, needs `docker compose up`): `cd e2e && npx playwright test`
- **No surprise plumbing** — new dependencies, lockfile churn, and changes
  under `.github/` get extra scrutiny and should be called for by the issue.

## Where to start

Issues labeled
[`good first issue`](https://github.com/JoshuaLeoSmith/forms-engine/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
are self-contained and point at the relevant code;
[`help wanted`](https://github.com/JoshuaLeoSmith/forms-engine/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
issues are meatier. Setup instructions are in the README's
[Development](README.md#development) section.
