package io.formsengine.web.dto;

import io.formsengine.definition.Definition;

import java.util.Map;

/**
 * Request/response DTOs for the public runtime API (BRD 9.2).
 */
public final class PublicDtos {

    private PublicDtos() {
    }

    /**
     * GET /public/v1/questionnaires/{publicId}/live payload (FR-L-2).
     * {@code submissionPolicy} rides along so the renderer knows the rules
     * without an extra round trip (Phase 5 FR5-12); it drives UI only — the
     * server re-checks at create/complete time.
     */
    public record LiveQuestionnaire(String publicId, String name, int versionNumber, Definition definition,
                                    String submissionPolicy) {
    }

    /**
     * POST responses request: version the embed loaded (FR-L-9 / D-5), plus
     * the optional external reference (Phase 5 FR5-1/2) — captured at
     * creation, immutable thereafter.
     */
    public record CreateResponseRequest(Integer versionNumber, String externalRef) {
    }

    /** GET /public/v1/questionnaires/{publicId}/ref-status payload (FR5-8): a boolean, nothing more (P5-D1). */
    public record RefStatus(String status) {
    }

    public record CreateResponseResult(String responseId) {
    }

    /** Position within the questionnaire (FR-L-10). */
    public record PositionDto(String stepId, String tabId) {
    }

    /**
     * PATCH responses request (FR-L-10, D-7). Answers arrive as
     * {@code Map<String,Object>} so invalid value shapes can be rejected with
     * a clear 400 (FR2-5) instead of a deserialization error.
     */
    public record PatchResponseRequest(Map<String, Object> answers, PositionDto lastPosition) {
    }

    /**
     * GET /public/v1/responses/{responseId} payload (Phase 4 FR4-2, P4-D1):
     * rehydration for refresh-resilient sessions. {@code definition} is the
     * full definition of the response's <b>pinned</b> version — a historical
     * version is only reachable by holding a valid {@code responseId} for it,
     * matching the authorization model of the rest of the public API.
     * {@code submissionPolicy} is the questionnaire's CURRENT policy (Phase 5
     * FR5-12) — UI signal only, the server re-checks at completion.
     */
    public record ResponseRehydration(
            String status,
            int versionNumber,
            Map<String, Object> answers,
            PositionDto lastPosition,
            Definition definition,
            String submissionPolicy) {
    }

    /**
     * POST /public/v1/responses/{responseId}/files result (Phase 3 §4.2): the
     * file reference object, also the element shape of a FILE_UPLOAD answer
     * array (FR3-9). A copy of the metadata for downstream convenience —
     * {@code uploaded_files} remains authoritative. {@code contentType} is the
     * verified type (FR3-21); storage keys never appear in any API response
     * (FR3-23).
     */
    public record FileReference(String fileId, String fileName, long size, String contentType) {
    }

    /**
     * GET /public/v1/geocode suggestion (FR2-11): Photon's GeoJSON normalized
     * to a flat address shape; missing components are empty strings and
     * {@code label} is the ready-to-render display string.
     */
    public record GeocodeSuggestion(
            String line1,
            String city,
            String state,
            String postalCode,
            String country,
            String label) {
    }
}
