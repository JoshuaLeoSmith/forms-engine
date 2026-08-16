# @forms-engine/angular

Thin Angular wrapper for the Forms-Engine `<forms-engine>` web component. All
logic lives in `@forms-engine/renderer`; this only translates inputs and
events.

<!-- npm strips video players, so this is a poster frame linking to the demo videos (FR61-5). -->
[![A conditional question shown live in the embedded questionnaire — it appears only while its visibility rule matches](https://raw.githubusercontent.com/JoshuaLeoSmith/forms-engine/master/docs/media/embed-demo.png)](https://github.com/JoshuaLeoSmith/forms-engine#see-it-in-60-seconds)

*▶ [Watch the 60-second demo on GitHub](https://github.com/JoshuaLeoSmith/forms-engine#see-it-in-60-seconds)*

```ts
import { FormsEngineComponent } from '@forms-engine/angular';

@Component({
  imports: [FormsEngineComponent],
  template: `
    <forms-engine-embed
      publicId="q_8f3k2m"
      apiBase="https://forms.your-domain.com"
      (completed)="done($event)" />
  `,
})
export class Page {
  done(e: { responseId: string }) {}
}
```

**Full reference — all inputs, outputs, and event payloads — lives in the
docs:
[forms-engine-site.pages.dev/embedding/angular](https://forms-engine-site.pages.dev/embedding/angular/).**

Part of Forms-Engine (MIT).
