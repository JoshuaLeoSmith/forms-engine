# Forms-Engine — React example

Mounts `<FormsEngine>` from [`@forms-engine/react`](../../packages/react) with
props and event callbacks, and logs every component event to the browser
console. `externalRef` is wired to a hardcoded fake user id to show where your
app's user id goes.

## Run

```bash
# from an external project you would start with:
#   npm install @forms-engine/react react react-dom
# Inside this monorepo the same dependency resolves to packages/react via npm
# workspaces instead — the code is identical either way; only dependency
# resolution differs (FR6-3).

# once, at the repo root: install and build the workspace packages
npm install && npm run build

# create the demo questionnaire (backend must be up: docker compose up)
node ../seed/seed.mjs        # prints a publicId

# paste the publicId into .env, then:
npm run dev                  # http://localhost:5173
```
