# @forms-engine/react

Thin React wrapper for the Forms-Engine `<forms-engine>` web component. All
logic lives in `@forms-engine/renderer`; this only translates props and events.

<!-- npm strips video players, so this is a poster frame linking to the demo videos (FR61-5). -->
[![A conditional question shown live in the embedded questionnaire — it appears only while its visibility rule matches](https://raw.githubusercontent.com/JoshuaLeoSmith/forms-engine/master/docs/media/embed-demo.png)](https://github.com/JoshuaLeoSmith/forms-engine#see-it-in-60-seconds)

*▶ [Watch the 60-second demo on GitHub](https://github.com/JoshuaLeoSmith/forms-engine#see-it-in-60-seconds)*

```tsx
import { FormsEngine } from '@forms-engine/react';

<FormsEngine
  publicId="q_8f3k2m"
  apiBase="https://forms.your-domain.com"
  onCompleted={({ responseId }) => console.log(responseId)}
/>
```

Props: `publicId`, `apiBase`, `theme?`, `onLoaded?`, `onScreenChanged?`,
`onCompleted?`, `onError?`, `className?`, `style?`.

Part of Forms-Engine (MIT).
