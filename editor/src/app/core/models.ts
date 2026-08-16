/**
 * Management API DTOs (backend §9.1) and re-exported shared model types.
 * The definition schema itself comes from @forms-engine/renderer/core so the
 * editor, renderer, and backend share one contract.
 */
export type {
  AnswersMap,
  AnswerValue,
  Combinator,
  Condition,
  ConditionValue,
  Definition,
  Operator,
  QuestionDef,
  QuestionWidth,
  Rule,
  RuleConfig,
  RuleMode,
  ScreenPosition,
  StepDef,
  TabDef,
} from '@forms-engine/renderer/core';
export {
  emptyDefinition,
  groupSections,
  normalize,
  QUESTION_CODE_PATTERN,
  SCHEMA_VERSION,
  syntheticTabId,
  SYNTHETIC_STEP_ID,
} from '@forms-engine/renderer/core';
export type {
  NormalizedDefinition,
  NormalizedStep,
  NormalizedTab,
  Section,
} from '@forms-engine/renderer/core';

import type { Definition, ScreenPosition } from '@forms-engine/renderer/core';

export interface QuestionnaireSummary {
  id: string;
  publicId: string;
  name: string;
  currentVersion: number;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  responseCount: number;
}

/** Phase 5 FR5-4: per-questionnaire repeat-submission handling. */
export type SubmissionPolicy = 'MULTIPLE' | 'ONE_PER_REF';

export interface QuestionnaireDetail {
  id: string;
  publicId: string;
  name: string;
  allowedOrigins: string[];
  submissionPolicy: SubmissionPolicy;
  currentVersion: number;
  hasUnpublishedChanges: boolean;
  draft: Definition;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface VersionSummary {
  versionNumber: number;
  note: string | null;
  publishedAt: string;
}

export interface VersionDetail extends VersionSummary {
  definition: Definition;
}

export interface ResponseExport {
  responseId: string;
  /** Phase 5 FR5-2/3: the host application's opaque identity label, if supplied. */
  externalRef: string | null;
  publicId: string;
  versionNumber: number;
  status: 'IN_PROGRESS' | 'COMPLETED';
  /** Typed values since Phase 2 §3: string | number | boolean | string[] | object. */
  answers: Record<string, unknown>;
  lastPosition: ScreenPosition | null;
  meta: { origin?: string | null; userAgent?: string | null };
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ApiErrorBody {
  status: number;
  message: string;
  errors?: string[];
}
