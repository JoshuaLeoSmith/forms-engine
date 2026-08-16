import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiBase } from './config';
import type {
  Definition,
  Page,
  QuestionnaireDetail,
  QuestionnaireSummary,
  ResponseExport,
  SubmissionPolicy,
  VersionDetail,
  VersionSummary,
} from './models';

/** Management API client (backend §9.1). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${apiBase()}/api/v1`;

  list(page = 0, size = 100): Promise<Page<QuestionnaireSummary>> {
    return firstValueFrom(
      this.http.get<Page<QuestionnaireSummary>>(`${this.base}/questionnaires`, {
        params: { page, size },
      }),
    );
  }

  create(name: string): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.post<QuestionnaireDetail>(`${this.base}/questionnaires`, { name }),
    );
  }

  get(id: string): Promise<QuestionnaireDetail> {
    return firstValueFrom(this.http.get<QuestionnaireDetail>(`${this.base}/questionnaires/${id}`));
  }

  saveDraft(id: string, draft: Definition): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.put<QuestionnaireDetail>(`${this.base}/questionnaires/${id}/draft`, draft),
    );
  }

  publish(id: string, note: string | null): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.post<QuestionnaireDetail>(`${this.base}/questionnaires/${id}/publish`, { note }),
    );
  }

  versions(id: string): Promise<VersionSummary[]> {
    return firstValueFrom(
      this.http.get<VersionSummary[]>(`${this.base}/questionnaires/${id}/versions`),
    );
  }

  version(id: string, n: number): Promise<VersionDetail> {
    return firstValueFrom(
      this.http.get<VersionDetail>(`${this.base}/questionnaires/${id}/versions/${n}`),
    );
  }

  restore(id: string, n: number): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.post<QuestionnaireDetail>(
        `${this.base}/questionnaires/${id}/versions/${n}/restore`,
        {},
      ),
    );
  }

  rename(id: string, name: string): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.patch<QuestionnaireDetail>(`${this.base}/questionnaires/${id}`, { name }),
    );
  }

  setAllowedOrigins(id: string, allowedOrigins: string[]): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.patch<QuestionnaireDetail>(`${this.base}/questionnaires/${id}`, {
        allowedOrigins,
      }),
    );
  }

  /** FR5-4: per-questionnaire submission policy (honor-system dedup). */
  setSubmissionPolicy(id: string, submissionPolicy: SubmissionPolicy): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.patch<QuestionnaireDetail>(`${this.base}/questionnaires/${id}`, {
        submissionPolicy,
      }),
    );
  }

  duplicate(id: string): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.post<QuestionnaireDetail>(`${this.base}/questionnaires/${id}/duplicate`, {}),
    );
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/questionnaires/${id}`));
  }

  /** ACTIVE uploaded-file totals for the FR3-13 deletion dialog. */
  fileStats(id: string): Promise<FileStats> {
    return firstValueFrom(
      this.http.get<FileStats>(`${this.base}/questionnaires/${id}/files/stats`),
    );
  }

  /** System upload caps (Phase 3 FR3-15/19) — env-tunable, so fetched, not assumed. */
  uploadsConfig(): Promise<UploadsConfig> {
    return firstValueFrom(this.http.get<UploadsConfig>(`${this.base}/uploads/config`));
  }

  responses(id: string, filter: ResponseFilter = {}, page = 0, size = 50): Promise<Page<ResponseExport>> {
    const params: Record<string, string | number> = { page, size };
    if (filter.status) {
      params['status'] = filter.status;
    }
    if (filter.versionNumber !== undefined) {
      params['versionNumber'] = filter.versionNumber;
    }
    if (filter.externalRef) {
      params['externalRef'] = filter.externalRef;
    }
    return firstValueFrom(
      this.http.get<Page<ResponseExport>>(`${this.base}/questionnaires/${id}/responses`, {
        params,
      }),
    );
  }

  /** FR4-9: hard delete with file cascade; 404 once it is gone. */
  deleteResponse(id: string, responseId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/questionnaires/${id}/responses/${responseId}`),
    );
  }

  /** FR4-12: import always creates a new questionnaire (P4-D3). */
  importQuestionnaire(payload: unknown): Promise<QuestionnaireDetail> {
    return firstValueFrom(
      this.http.post<QuestionnaireDetail>(`${this.base}/questionnaires/import`, payload),
    );
  }

  /** FR4-11: export download URL — the server sets the attachment disposition. */
  exportUrl(id: string): string {
    return `${this.base}/questionnaires/${id}/export`;
  }

  /** FR4-15: streamed CSV export URL for the given filters. */
  csvExportUrl(id: string, filter: ResponseFilter = {}): string {
    const params = new URLSearchParams();
    if (filter.status) {
      params.set('status', filter.status);
    }
    if (filter.versionNumber !== undefined) {
      params.set('versionNumber', String(filter.versionNumber));
    }
    if (filter.externalRef) {
      params.set('externalRef', filter.externalRef);
    }
    const query = params.toString();
    return `${this.base}/questionnaires/${id}/responses/export.csv${query ? `?${query}` : ''}`;
  }
}

/** Filters shared by the responses browser and its CSV export (FR4-10/15; FR5-3 adds externalRef). */
export interface ResponseFilter {
  status?: 'IN_PROGRESS' | 'COMPLETED';
  versionNumber?: number;
  externalRef?: string;
}

/** ACTIVE uploaded files retained with a questionnaire's responses (FR3-13). */
export interface FileStats {
  fileCount: number;
  totalBytes: number;
}

/** System-level upload caps (FR3-19), served by the backend. */
export interface UploadsConfig {
  maxFileSizeMb: number;
  maxFilesPerResponse: number;
  maxBytesPerResponse: number;
}

/** Extracts the human-readable error list from a management API failure. */
export function apiErrors(err: unknown): string[] {
  const body = (err as { error?: { message?: string; errors?: string[] } })?.error;
  if (body?.errors?.length) {
    return body.errors;
  }
  if (body?.message) {
    return [body.message];
  }
  return ['Something went wrong talking to the backend.'];
}
