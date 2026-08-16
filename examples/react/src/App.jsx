import { FormsEngine } from '@forms-engine/react';

// Config lives in ../.env (FR6-2) — run `node ../seed/seed.mjs` to create the
// demo questionnaire and print the publicId to paste there.
const API_BASE = import.meta.env.VITE_FE_API_BASE;
const PUBLIC_ID = import.meta.env.VITE_FE_PUBLIC_ID;

export default function App() {
  return (
    <FormsEngine
      publicId={PUBLIC_ID}
      apiBase={API_BASE}
      externalRef="user-4821" /* your app's user id goes here */
      onLoaded={(detail) => console.log('fe-loaded', detail)}
      onScreenChanged={(detail) => console.log('fe-screen-changed', detail)}
      onCompleted={(detail) => console.log('fe-completed', detail)}
      onResumed={(detail) => console.log('fe-resumed', detail)}
      onAlreadySubmitted={(detail) => console.log('fe-already-submitted', detail)}
      onError={(detail) => console.log('fe-error', detail)}
    />
  );
}
