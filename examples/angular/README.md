# Forms-Engine — Angular example

Minimal standalone-component app mounting `<forms-engine-embed>` from
[`@forms-engine/angular`](../../packages/angular), logging every component
event to the browser console. It deliberately imports nothing from the editor
— only the published-package surface, like a stranger would (FR6-6).

## Run

```bash
# from an external project you would start with:
#   npm install @forms-engine/angular
# Inside this monorepo the same dependency resolves to packages/angular via
# npm workspaces instead — the code is identical either way; only dependency
# resolution differs (FR6-3).

# once, at the repo root: install and build the workspace packages
npm install && npm run build

# create the demo questionnaire (backend must be up: docker compose up)
node ../seed/seed.mjs        # prints a publicId

# paste the publicId into src/app.ts (PUBLIC_ID), then:
npm start                    # http://localhost:4200
```
