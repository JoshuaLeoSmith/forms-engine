# @forms-engine/renderer

The framework-agnostic Forms-Engine questionnaire renderer: the
`<forms-engine>` custom element plus the shared model/rule-engine core.

<!-- npm strips video players, so this is a poster frame linking to the demo videos (FR61-5). -->
[![A conditional question shown live in the embedded questionnaire — it appears only while its visibility rule matches](https://raw.githubusercontent.com/JoshuaLeoSmith/forms-engine/master/docs/media/embed-demo.png)](https://github.com/JoshuaLeoSmith/forms-engine#see-it-in-60-seconds)

*▶ [Watch the 60-second demo on GitHub](https://github.com/JoshuaLeoSmith/forms-engine#see-it-in-60-seconds)*

```html
<script type="module" src="https://unpkg.com/@forms-engine/renderer/dist/forms-engine.esm.js"></script>
<forms-engine public-id="q_8f3k2m" api-base="https://forms.your-domain.com"></forms-engine>
```

Or from npm:

```ts
import '@forms-engine/renderer'; // registers <forms-engine>
```

**Full reference — every attribute, event, CSS custom property, and the
labels override — lives in the docs:
[forms-engine-site.pages.dev/embedding/web-component](https://forms-engine-site.pages.dev/embedding/web-component/).**

- **Pure core:** `@forms-engine/renderer/core` exports the definition types,
  normalization, and rule engine with no DOM or Lit dependency.

Part of [Forms-Engine](https://github.com/JoshuaLeoSmith/forms-engine) (MIT).
