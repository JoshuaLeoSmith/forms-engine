/**
 * @forms-engine/renderer — importing this module registers the
 * <forms-engine> custom element and re-exports the pure core.
 */
export * from './core/index.js';
export * from './api/client.js';
export {
  registerQuestionRenderer,
  getQuestionRenderer,
  type QuestionRenderContext,
  type QuestionRenderer,
} from './component/question-renderers.js';
export { FormsEngineElement, defineFormsEngine } from './component/forms-engine.js';
export {
  FeUploadElement,
  defineFeUpload,
  formatBytes,
  type UploadContext,
} from './component/fe-upload.js';

import { defineFormsEngine } from './component/forms-engine.js';

defineFormsEngine();
