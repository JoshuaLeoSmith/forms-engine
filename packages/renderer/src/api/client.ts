/**
 * Public runtime API client (BRD §9.2). Mutating calls retry 3 times with
 * exponential backoff on network errors and 5xx responses (FR-L-12).
 */
import type { AnswersMap, Definition, FileReference, ScreenPosition } from '../core/types.js';

/** Per-questionnaire submission policy (Phase 5 FR5-4/12). */
export type SubmissionPolicy = 'MULTIPLE' | 'ONE_PER_REF';

export interface LiveQuestionnaire {
  publicId: string;
  name: string;
  versionNumber: number;
  definition: Definition;
  /** Phase 5 FR5-12: UI signal only — the server re-checks at create/complete. */
  submissionPolicy?: SubmissionPolicy;
}

/**
 * Rehydration payload (Phase 4 FR4-2): a stored response plus the FULL
 * definition of its pinned version — the only public path to a historical
 * version, reachable only by holding a valid responseId (P4-D1).
 */
export interface StoredResponse {
  status: 'IN_PROGRESS' | 'COMPLETED';
  versionNumber: number;
  answers: AnswersMap;
  lastPosition: ScreenPosition | null;
  definition: Definition;
  /** Phase 5 FR5-12: the questionnaire's CURRENT policy, not anything pinned. */
  submissionPolicy?: SubmissionPolicy;
}

/** Normalized geocode suggestion from the backend Photon proxy (FR2-11). */
export interface GeocodeSuggestion {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Display string for the suggestion list. */
  label: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Machine-readable server code, e.g. ALREADY_SUBMITTED (Phase 5 FR5-6). */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** True when an error is the FR5-6 409 the renderer swaps to the already-submitted state on. */
export function isAlreadySubmitted(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'ALREADY_SUBMITTED';
}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiClient {
  private readonly base: string;

  constructor(apiBase: string) {
    this.base = apiBase.replace(/\/+$/, '');
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    { retry }: { retry: boolean },
  ): Promise<T> {
    let lastError: unknown;
    const attempts = retry ? RETRY_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
      try {
        const response = await fetch(`${this.base}${path}`, {
          ...init,
          headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        });
        if (response.ok) {
          const text = await response.text();
          return (text ? JSON.parse(text) : undefined) as T;
        }
        const errorBody = await response.text().catch(() => '');
        lastError = new ApiError(
          `${init.method ?? 'GET'} ${path} failed: HTTP ${response.status}`,
          response.status,
          extractServerCode(errorBody),
        );
        // 4xx will not get better by retrying.
        if (response.status < 500) {
          throw lastError;
        }
      } catch (err) {
        if (err instanceof ApiError && err.status !== undefined && err.status < 500) {
          throw err;
        }
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new ApiError(String(lastError));
  }

  /** GET the live version (FR-L-2). Not retried: load errors render an error state. */
  fetchLive(publicId: string): Promise<LiveQuestionnaire> {
    return this.request<LiveQuestionnaire>(
      `/public/v1/questionnaires/${encodeURIComponent(publicId)}/live`,
      { method: 'GET' },
      { retry: false },
    );
  }

  /**
   * Fetches a stored response for session rehydration (FR4-3). 404 = the
   * response was deleted server-side; callers clear their stored session and
   * start fresh. Not retried: it runs on the load path.
   */
  fetchResponse(responseId: string): Promise<StoredResponse> {
    return this.request<StoredResponse>(
      `/public/v1/responses/${encodeURIComponent(responseId)}`,
      { method: 'GET' },
      { retry: false },
    );
  }

  /**
   * Lazy response creation on first forward navigation (FR-L-8). The external
   * reference (Phase 5 FR5-1/2) is captured at creation, immutable thereafter.
   */
  createResponse(
    publicId: string,
    versionNumber: number,
    externalRef?: string,
  ): Promise<{ responseId: string }> {
    const body = externalRef ? { versionNumber, externalRef } : { versionNumber };
    return this.request<{ responseId: string }>(
      `/public/v1/questionnaires/${encodeURIComponent(publicId)}/responses`,
      { method: 'POST', body: JSON.stringify(body) },
      { retry: true },
    );
  }

  /**
   * Completion status for an external reference (Phase 5 FR5-8) — a boolean,
   * nothing more. Failures resolve to NONE: an auxiliary signal must never
   * block the form; the server remains the actual gate (FR5-6).
   */
  fetchRefStatus(publicId: string, ref: string): Promise<'NONE' | 'COMPLETED'> {
    return this.request<{ status?: string }>(
      `/public/v1/questionnaires/${encodeURIComponent(publicId)}/ref-status?ref=${encodeURIComponent(ref)}`,
      { method: 'GET' },
      { retry: false },
    ).then(
      (result) => (result?.status === 'COMPLETED' ? 'COMPLETED' : 'NONE'),
      () => 'NONE',
    );
  }

  /** Full-replace answers save on every screen navigation (FR-L-10, D-7). */
  patchResponse(responseId: string, answers: AnswersMap, lastPosition: ScreenPosition): Promise<void> {
    return this.request<void>(
      `/public/v1/responses/${encodeURIComponent(responseId)}`,
      { method: 'PATCH', body: JSON.stringify({ answers, lastPosition }) },
      { retry: true },
    );
  }

  /**
   * Address autocomplete via the backend geocode proxy (FR2-11). Failures
   * resolve to [] — autocomplete degrades silently, never blocks entry
   * (§6.8.4 / FR2-13).
   */
  geocode(query: string, country?: string, limit = 5): Promise<GeocodeSuggestion[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (country) {
      params.set('country', country);
    }
    return this.request<GeocodeSuggestion[]>(
      `/public/v1/geocode?${params.toString()}`,
      { method: 'GET' },
      { retry: false },
    ).then(
      (result) => (Array.isArray(result) ? result : []),
      () => [],
    );
  }

  /** Marks the response COMPLETED; idempotent server-side (FR-L-11). */
  completeResponse(responseId: string): Promise<void> {
    return this.request<void>(
      `/public/v1/responses/${encodeURIComponent(responseId)}/complete`,
      { method: 'POST' },
      { retry: true },
    );
  }

  /**
   * Uploads one file to a response (Phase 3 §6, FR3-8/17). Uses
   * XMLHttpRequest because fetch still lacks portable upload progress
   * (NFR3-1). Never retried automatically — retries are user-triggered
   * (FR3-20). The returned handle's abort() cancels the transfer.
   */
  uploadFile(
    responseId: string,
    questionCode: string,
    file: File,
    onProgress?: (fraction: number) => void,
  ): UploadHandle {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<FileReference>((resolve, reject) => {
      xhr.open('POST', `${this.base}/public/v1/responses/${encodeURIComponent(responseId)}/files`);
      xhr.upload?.addEventListener('progress', (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress?.(event.loaded / event.total);
        }
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as FileReference);
          } catch (err) {
            reject(new ApiError('Upload succeeded but the response could not be read', xhr.status));
          }
        } else {
          reject(new ApiError(extractServerMessage(xhr.responseText) ?? `Upload failed (HTTP ${xhr.status})`, xhr.status));
        }
      });
      xhr.addEventListener('error', () => reject(new ApiError('Upload failed — check your connection')));
      xhr.addEventListener('abort', () => reject(new UploadAbortedError()));
      const form = new FormData();
      form.append('questionCode', questionCode);
      form.append('file', file, file.name);
      xhr.send(form);
    });
    return { promise, abort: () => xhr.abort() };
  }

  /**
   * Removes an uploaded file (FR3-10/11). Idempotent server-side; callers
   * treat failures as best-effort — the orphan cleanup job is the safety net.
   */
  deleteFile(responseId: string, fileId: string): Promise<void> {
    return this.request<void>(
      `/public/v1/responses/${encodeURIComponent(responseId)}/files/${encodeURIComponent(fileId)}`,
      { method: 'DELETE' },
      { retry: true },
    );
  }
}

/** In-flight upload: await the reference or cancel the transfer (FR3-17). */
export interface UploadHandle {
  promise: Promise<FileReference>;
  abort(): void;
}

/** Rejection reason for a user-cancelled upload — not an error state. */
export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadAbortedError';
  }
}

/** Pulls the machine-readable code out of the backend's error JSON (FR5-6). */
function extractServerCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return typeof parsed.code === 'string' && parsed.code.length > 0 ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}

/** Pulls the human-readable message out of the backend's error JSON, if any. */
function extractServerMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; errors?: unknown };
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0 && typeof parsed.errors[0] === 'string') {
      return parsed.errors[0];
    }
    return typeof parsed.message === 'string' && parsed.message.length > 0 ? parsed.message : null;
  } catch {
    return null;
  }
}
