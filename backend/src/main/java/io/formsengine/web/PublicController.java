package io.formsengine.web;

import io.formsengine.domain.Questionnaire;
import io.formsengine.domain.QuestionnaireVersion;
import io.formsengine.domain.ResponseDocument;
import io.formsengine.service.OriginService;
import io.formsengine.service.PublicResponseService;
import io.formsengine.web.dto.PublicDtos.CreateResponseRequest;
import io.formsengine.web.dto.PublicDtos.CreateResponseResult;
import io.formsengine.web.dto.PublicDtos.LiveQuestionnaire;
import io.formsengine.web.dto.PublicDtos.PatchResponseRequest;
import io.formsengine.web.dto.PublicDtos.PositionDto;
import io.formsengine.web.dto.PublicDtos.RefStatus;
import io.formsengine.web.dto.PublicDtos.ResponseRehydration;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public runtime API consumed by embeds (BRD 9.2, FR-B-3/4/5).
 *
 * <p>Origin enforcement (FR-B-3): the live GET always returns data but only
 * emits the CORS allow header for allowed origins (the browser blocks the
 * read); mutating endpoints reject disallowed origins server-side with 403.
 */
@RestController
@RequestMapping("/public/v1")
public class PublicController {

    private final PublicResponseService service;
    private final OriginService origins;

    public PublicController(PublicResponseService service, OriginService origins) {
        this.service = service;
        this.origins = origins;
    }

    /** FR-L-2; Cache-Control: no-store keeps publishes visible within seconds (FR-E-17). */
    @GetMapping("/questionnaires/{publicId}/live")
    public LiveQuestionnaire live(@PathVariable String publicId,
                                  @RequestHeader(value = "Origin", required = false) String origin,
                                  HttpServletResponse httpResponse) {
        Questionnaire q = service.getByPublicId(publicId);
        QuestionnaireVersion live = service.getLiveVersion(q);
        origins.applyCorsHeaders(q, origin, httpResponse);
        httpResponse.setHeader("Cache-Control", "no-store");
        return new LiveQuestionnaire(q.getPublicId(), q.getName(), live.getVersionNumber(), live.getDefinition(),
                q.getSubmissionPolicy());
    }

    /**
     * FR5-8 (P5-D1): completion status for an external reference — a boolean,
     * never a responseId, never answers, never an in-progress signal.
     * Nonexistent questionnaire-ref combinations answer identically (NONE,
     * FR5-10), so the origin header is echoed uniformly rather than looked up
     * (the body carries nothing origin-worthy to protect, and differing header
     * behavior would itself leak existence).
     */
    @GetMapping("/questionnaires/{publicId}/ref-status")
    public RefStatus refStatus(@PathVariable String publicId,
                               @RequestParam("ref") String ref,
                               @RequestHeader(value = "Origin", required = false) String origin,
                               HttpServletResponse httpResponse) {
        if (origin != null && !origin.isBlank()) {
            httpResponse.setHeader("Access-Control-Allow-Origin", origin);
            httpResponse.addHeader("Vary", "Origin");
        }
        httpResponse.setHeader("Cache-Control", "no-store");
        return new RefStatus(service.refStatus(publicId, ref));
    }

    /**
     * FR4-2 (P4-D1): rehydration for refresh-resilient sessions — the pinned
     * version's full definition embedded in the payload. Origin behavior
     * mirrors the live GET: data is returned regardless, but the CORS allow
     * header is echoed only for allowed origins (the browser blocks the read).
     */
    @GetMapping("/responses/{responseId}")
    public ResponseRehydration rehydrate(@PathVariable String responseId,
                                         @RequestHeader(value = "Origin", required = false) String origin,
                                         HttpServletResponse httpResponse) {
        ResponseDocument r;
        QuestionnaireVersion pinned;
        try {
            r = service.getResponse(responseId);
            pinned = service.getPinnedVersion(r);
        } catch (ApiException notFound) {
            // FR4-3 / P4-D7: this 404 is the embed's sessionStorage reset
            // signal, so the browser must be able to READ the status — echo
            // the origin. A deleted response has no origin policy left to
            // consult, and the 404 body carries no data.
            if (origin != null && !origin.isBlank()) {
                httpResponse.setHeader("Access-Control-Allow-Origin", origin);
                httpResponse.addHeader("Vary", "Origin");
            }
            throw notFound;
        }
        java.util.Optional<Questionnaire> owner = service.findQuestionnaire(r.getPublicId());
        owner.ifPresent(q -> origins.applyCorsHeaders(q, origin, httpResponse));
        httpResponse.setHeader("Cache-Control", "no-store");
        PositionDto lastPosition = r.getLastPosition() == null ? null
                : new PositionDto(r.getLastPosition().getStepId(), r.getLastPosition().getTabId());
        // FR5-12: the CURRENT policy, not anything pinned — UI signal only.
        String submissionPolicy = owner.map(Questionnaire::getSubmissionPolicy)
                .orElse(Questionnaire.POLICY_MULTIPLE);
        return new ResponseRehydration(r.getStatus(), r.getVersionNumber(), r.getAnswers(),
                lastPosition, pinned.getDefinition(), submissionPolicy);
    }

    /** FR-L-8: lazy response creation, pinned to the loaded version (D-5/D-6). */
    @PostMapping("/questionnaires/{publicId}/responses")
    @ResponseStatus(HttpStatus.CREATED)
    public CreateResponseResult createResponse(@PathVariable String publicId,
                                               @RequestBody CreateResponseRequest request,
                                               @RequestHeader(value = "Origin", required = false) String origin,
                                               @RequestHeader(value = "User-Agent", required = false) String userAgent,
                                               HttpServletResponse httpResponse) {
        Questionnaire q = service.getByPublicId(publicId);
        enforceOrigin(q, origin, httpResponse);
        ResponseDocument r = service.createResponse(q,
                request == null ? null : request.versionNumber(),
                request == null ? null : request.externalRef(),
                origin, userAgent);
        return new CreateResponseResult(r.getResponseId());
    }

    /** FR-L-10 / D-7: full-replace answer save; 409 once completed. */
    @PatchMapping("/responses/{responseId}")
    public void patchResponse(@PathVariable String responseId,
                              @RequestBody PatchResponseRequest request,
                              @RequestHeader(value = "Origin", required = false) String origin,
                              HttpServletResponse httpResponse) {
        enforceOriginForResponse(responseId, origin, httpResponse);
        String stepId = request != null && request.lastPosition() != null ? request.lastPosition().stepId() : null;
        String tabId = request != null && request.lastPosition() != null ? request.lastPosition().tabId() : null;
        service.patchResponse(responseId, request == null ? null : request.answers(), stepId, tabId);
    }

    /** FR-L-11: idempotent completion. */
    @PostMapping("/responses/{responseId}/complete")
    public void complete(@PathVariable String responseId,
                         @RequestHeader(value = "Origin", required = false) String origin,
                         HttpServletResponse httpResponse) {
        enforceOriginForResponse(responseId, origin, httpResponse);
        service.complete(responseId);
    }

    private void enforceOriginForResponse(String responseId, String origin, HttpServletResponse httpResponse) {
        if (origin == null || origin.isBlank()) {
            return;
        }
        // Look up the owning questionnaire for its allowedOrigins; orphaned
        // responses (questionnaire deleted) skip the check.
        ResponseDocument r = service.getResponse(responseId);
        service.findQuestionnaire(r.getPublicId())
                .ifPresent(q -> enforceOrigin(q, origin, httpResponse));
    }

    private void enforceOrigin(Questionnaire q, String origin, HttpServletResponse httpResponse) {
        if (origin != null && !origin.isBlank() && !origins.isAllowed(q, origin)) {
            throw ApiException.forbidden("origin '" + origin + "' is not allowed for this questionnaire");
        }
        origins.applyCorsHeaders(q, origin, httpResponse);
    }
}
