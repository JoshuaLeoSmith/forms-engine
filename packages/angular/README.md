# @forms-engine/angular

Thin Angular wrapper for the Forms-Engine `<forms-engine>` web component. All
logic lives in `@forms-engine/renderer`; this only translates inputs and
events.

<!-- npm strips video players, so this is a poster frame linking to the demo videos (FR61-5). -->
[![A conditional question shown live in the embedded questionnaire — it appears only while its visibility rule matches](https://raw.githubusercontent.com/forms-engine/forms-engine/main/docs/media/embed-demo.png)](https://github.com/forms-engine/forms-engine#see-it-in-60-seconds)

*▶ [Watch the 60-second demo on GitHub](https://github.com/forms-engine/forms-engine#see-it-in-60-seconds)*

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

Inputs: `publicId` (required), `apiBase` (required), `theme?`. Outputs:
`loaded`, `screenChanged`, `completed`, `errored`.

Part of Forms-Engine (MIT).
