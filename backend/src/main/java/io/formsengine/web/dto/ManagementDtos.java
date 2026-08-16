package io.formsengine.web.dto;

import io.formsengine.definition.Definition;
import io.formsengine.domain.ResponseDocument;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Request/response DTOs for the management API (BRD 9.1). Grouped as nested
 * records so the wire contract lives in one file.
 */
public final class ManagementDtos {

    private ManagementDtos() {
    }

    /** FR-E-1 list row. */
    public record QuestionnaireSummary(
            String id,
            String publicId,
            String name,
            int currentVersion,
            boolean hasUnpublishedChanges,
            Instant updatedAt,
            long responseCount) {
    }

    /** Full questionnaire metadata + draft definition. {@code submissionPolicy}: Phase 5 FR5-4. */
    public record QuestionnaireDetail(
            String id,
            String publicId,
            String name,
            List<String> allowedOrigins,
            String submissionPolicy,
            int currentVersion,
            boolean hasUnpublishedChanges,
            Definition draft,
            Instant updatedAt) {
    }

    /** Generic pagination envelope: { items, page, size, total }. */
    public record PageResult<T>(List<T> items, int page, int size, long total) {
    }

    public record CreateQuestionnaireRequest(@NotBlank String name) {
    }

    /** Any subset of fields; {@code submissionPolicy} ∈ MULTIPLE | ONE_PER_REF (FR5-4). */
    public record PatchQuestionnaireRequest(String name, List<String> allowedOrigins, String submissionPolicy) {
    }

    public record PublishRequest(String note) {
    }

    public record VersionSummary(int versionNumber, String note, Instant publishedAt) {
    }

    public record VersionDetail(int versionNumber, String note, Instant publishedAt, Definition definition) {
    }

    /**
     * GET /questionnaires/{id}/files/stats (Phase 3 FR3-13): retained ACTIVE
     * file count and total bytes, for the deletion-confirmation dialog.
     */
    public record FileStats(long fileCount, long totalBytes) {
    }

    /**
     * GET /uploads/config (Phase 3 FR3-15/19): the env-tunable system caps the
     * editor's FILE_UPLOAD panel displays and validates against — sourced from
     * the exact properties the upload enforcement uses.
     * {@code maxBytesPerResponse} is in bytes.
     */
    public record UploadsConfig(int maxFileSizeMb, int maxFilesPerResponse, long maxBytesPerResponse) {
    }

    /**
     * GET /questionnaires/{id}/export body (Phase 4 FR4-11): the portable
     * envelope. {@code formsEngineExport} is the export-envelope version,
     * independent of the definition's {@code schemaVersion}. Deliberately
     * excluded: {@code publicId}, {@code allowedOrigins}, responses and
     * version history (P4-D3) — origins are environment-specific and the
     * definition exported is the DRAFT.
     */
    public record QuestionnaireExport(
            int formsEngineExport,
            Instant exportedAt,
            String name,
            Definition definition) {
    }

    /**
     * POST /questionnaires/import body (Phase 4 FR4-12) — the FR4-11 export
     * file. {@code exportedAt} is accepted but ignored.
     */
    public record QuestionnaireImportRequest(
            Integer formsEngineExport,
            Instant exportedAt,
            String name,
            Definition definition) {
    }

    /** Read-only response export row (BRD 9.1 convenience export; {@code externalRef}: Phase 5 FR5-3). */
    public record ResponseExport(
            String responseId,
            String externalRef,
            String publicId,
            int versionNumber,
            String status,
            Map<String, Object> answers,
            ResponseDocument.Position lastPosition,
            ResponseDocument.Meta meta,
            Instant createdAt,
            Instant updatedAt,
            Instant completedAt) {
    }
}
