# Forms-Engine — plain-HTML example

One HTML file mounting the `<forms-engine>` web component and logging every
component event to the browser console. This file is the canonical
copy-source for the editor's Embed panel snippet (FR6-4) and the page the
Playwright end-to-end suite runs against (FR6-10).

## Run

```bash
# once, at the repo root: build the renderer bundle the script tag references
npm install && npm run build

# create the demo questionnaire (backend must be up: docker compose up)
node ../seed/seed.mjs        # prints a publicId

# paste the publicId into index.html (the public-id attribute), then serve
# the repo root — module scripts cannot load over file://
npx serve ../..              # then open /examples/plain-html/
```

Outside this repo, swap the script `src` for the CDN build:

```html
<script type="module" src="https://unpkg.com/@forms-engine/renderer/dist/forms-engine.esm.js"></script>
```
