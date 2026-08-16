/**
 * @forms-engine/react — thin React wrapper for the <forms-engine> web
 * component (FR-P-2). All logic lives in the core component; this only
 * translates props and DOM events (BRD §8).
 */
import { createElement, useEffect, useRef, type CSSProperties } from 'react';
import '@forms-engine/renderer';

export interface FormsEngineScreenChange {
  stepId: string;
  tabId: string;
}

export interface FormsEngineCompleted {
  responseId: string;
}

export interface FormsEngineError {
  message: string;
  cause?: unknown;
}

export interface FormsEngineResumed {
  responseId: string;
  /** `stepId|tabId` key of the screen the session resumed on (null before the first screen). */
  screenId: string | null;
  stepId?: string;
  tabId?: string;
}

export interface FormsEngineAlreadySubmitted {
  externalRef: string;
}

export interface FormsEngineProps {
  /** The questionnaire's stable public id (FR-L-1). */
  publicId: string;
  /** Base URL of the self-hosted Forms-Engine backend. */
  apiBase: string;
  /** Reserved; v1 ships one default theme themable via CSS custom properties. */
  theme?: string;
  /**
   * Opaque external reference identifying the respondent in your own terms
   * (Phase 5 FR5-1). Honor-system only — spoofable by anyone with devtools.
   */
  externalRef?: string;
  onLoaded?: (detail: { publicId: string; versionNumber: number }) => void;
  onScreenChanged?: (detail: FormsEngineScreenChange) => void;
  onCompleted?: (detail: FormsEngineCompleted) => void;
  /** Fired when a refreshed session resumes where it left off (FR4-4). */
  onResumed?: (detail: FormsEngineResumed) => void;
  /** Fired when this reference has already completed the form (FR5-11). */
  onAlreadySubmitted?: (detail: FormsEngineAlreadySubmitted) => void;
  onError?: (detail: FormsEngineError) => void;
  className?: string;
  style?: CSSProperties;
}

export function FormsEngine({
  publicId,
  apiBase,
  theme,
  externalRef,
  onLoaded,
  onScreenChanged,
  onCompleted,
  onResumed,
  onAlreadySubmitted,
  onError,
  className,
  style,
}: FormsEngineProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const handlers: Array<[string, EventListener]> = [];
    const listen = (type: string, callback?: (detail: never) => void) => {
      if (!callback) {
        return;
      }
      const handler = (event: Event) => callback((event as CustomEvent).detail as never);
      el.addEventListener(type, handler);
      handlers.push([type, handler]);
    };
    listen('fe-loaded', onLoaded);
    listen('fe-screen-changed', onScreenChanged);
    listen('fe-completed', onCompleted);
    listen('fe-resumed', onResumed);
    listen('fe-already-submitted', onAlreadySubmitted);
    listen('fe-error', onError);
    return () => {
      for (const [type, handler] of handlers) {
        el.removeEventListener(type, handler);
      }
    };
  }, [onLoaded, onScreenChanged, onCompleted, onResumed, onAlreadySubmitted, onError]);

  return createElement('forms-engine', {
    ref,
    'public-id': publicId,
    'api-base': apiBase,
    theme,
    'external-ref': externalRef,
    class: className,
    style,
  });
}

export default FormsEngine;
