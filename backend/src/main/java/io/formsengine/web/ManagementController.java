package io.formsengine.web;

import io.formsengine.definition.Definition;
import io.formsengine.domain.Questionnaire;
import io.formsengine.domain.QuestionnaireVersion;
import io.formsengine.domain.ResponseDocument;
import io.formsengine.service.CsvExportService;
import io.formsengine.service.QuestionnaireService;
import io.formsengine.service.ResponseQueryService;
import io.formsengine.web.dto.ManagementDtos.CreateQuestionnaireRequest;
import io.formsengine.web.dto.ManagementDtos.PageResult;
import io.formsengine.web.dto.ManagementDtos.PatchQuestionnaireRequest;
import io.formsengine.web.dto.ManagementDtos.PublishRequest;
import io.formsengine.web.dto.ManagementDtos.QuestionnaireDetail;
import io.formsengine.web.dto.ManagementDtos.QuestionnaireExport;
import io.formsengine.web.dto.ManagementDtos.QuestionnaireImportRequest;
import io.formsengine.web.dto.ManagementDtos.QuestionnaireSummary;
import io.formsengine.web.dto.ManagementDtos.ResponseExport;
import io.formsengine.web.dto.ManagementDtos.VersionDetail;
import io.formsengine.web.dto.ManagementDtos.VersionSummary;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Management API consumed by the editor (BRD 9.1, FR-B-1, FR-B-2).
 * No authentication in v1 — the self-hoster network-protects {@code /api/**}
 * (NFR-3).
 */
@RestController
@RequestMapping("/api/v1/questionnaires")
public class ManagementController {

    private static final Set<String> STATUSES = Set.of(
            ResponseDocument.STATUS_IN_PROGRESS, ResponseDocument.STATUS_COMPLETED);

    private final QuestionnaireService service;
    private final ResponseQueryService responseQueries;
    private final CsvExportService csv;

    public ManagementController(QuestionnaireService service, ResponseQueryService responseQueries,
                                CsvExportService csv) {
        this.service = service;
        this.responseQueries = responseQueries;
        this.csv = csv;
    }

    @GetMapping
    public PageResult<QuestionnaireSummary> list(@RequestParam(defaultValue = "0") int page,
                                                 @RequestParam(defaultValue = "50") int size) {
        Page<Questionnaire> result = service.list(Math.max(page, 0), Math.min(Math.max(size, 1), 200));
        List<QuestionnaireSummary> items = result.getContent().stream()
                .map(q -> new QuestionnaireSummary(
                        q.getId().toHexString(),
                        q.getPublicId(),
                        q.getName(),
                        q.getCurrentVersion(),
                        q.hasUnpublishedChanges(),
                        q.getUpdatedAt(),
                        service.responseCount(q.getId())))
                .toList();
        return new PageResult<>(items, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public QuestionnaireDetail create(@Valid @RequestBody CreateQuestionnaireRequest request) {
        return toDetail(service.create(request.name().trim()));
    }

    @GetMapping("/{id}")
    public QuestionnaireDetail get(@PathVariable String id) {
        return toDetail(service.get(id));
    }

    @PutMapping("/{id}/draft")
    public QuestionnaireDetail updateDraft(@PathVariable String id, @RequestBody Definition definition) {
        return toDetail(service.updateDraft(id, definition));
    }

    @PostMapping("/{id}/publish")
    public QuestionnaireDetail publish(@PathVariable String id,
                                       @RequestBody(required = false) PublishRequest request) {
        String note = request == null ? null : request.note();
        return toDetail(service.publish(id, note));
    }

    @GetMapping("/{id}/versions")
    public List<VersionSummary> versions(@PathVariable String id) {
        return service.listVersions(id).stream()
                .map(v -> new VersionSummary(v.getVersionNumber(), v.getNote(), v.getPublishedAt()))
                .toList();
    }

    @GetMapping("/{id}/versions/{n}")
    public VersionDetail version(@PathVariable String id, @PathVariable int n) {
        QuestionnaireVersion v = service.getVersion(id, n);
        return new VersionDetail(v.getVersionNumber(), v.getNote(), v.getPublishedAt(), v.getDefinition());
    }

    @PostMapping("/{id}/versions/{n}/restore")
    public QuestionnaireDetail restore(@PathVariable String id, @PathVariable int n) {
        return toDetail(service.restore(id, n));
    }

    @PostMapping("/{id}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public QuestionnaireDetail duplicate(@PathVariable String id) {
        return toDetail(service.duplicate(id));
    }

    @PatchMapping("/{id}")
    public QuestionnaireDetail patch(@PathVariable String id, @RequestBody PatchQuestionnaireRequest request) {
        return toDetail(service.patch(id, request.name(), request.allowedOrigins(), request.submissionPolicy()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        service.delete(id);
    }

    /**
     * Convenience read-only export, newest first (BRD 9.1; FR4-10 adds the
     * version filter, FR5-3 the externalRef filter — "did user #4821 complete
     * intake?" is one filtered lookup).
     */
    @GetMapping("/{id}/responses")
    public PageResult<ResponseExport> listResponses(@PathVariable String id,
                                                    @RequestParam(required = false) String status,
                                                    @RequestParam(required = false) Integer versionNumber,
                                                    @RequestParam(required = false) String externalRef,
                                                    @RequestParam(defaultValue = "0") int page,
                                                    @RequestParam(defaultValue = "50") int size) {
        Questionnaire q = service.get(id);
        if (status != null && !status.isBlank() && !STATUSES.contains(status)) {
            throw ApiException.badRequest("invalid status filter '" + status + "' (must be IN_PROGRESS or COMPLETED)");
        }
        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<ResponseDocument> result = responseQueries.page(q.getId(), status, versionNumber, externalRef, pageable);
        List<ResponseExport> items = result.getContent().stream()
                .map(r -> new ResponseExport(
                        r.getResponseId(),
                        r.getExternalRef(),
                        r.getPublicId(),
                        r.getVersionNumber(),
                        r.getStatus(),
                        r.getAnswers(),
                        r.getLastPosition(),
                        r.getMeta(),
                        r.getCreatedAt(),
                        r.getUpdatedAt(),
                        r.getCompletedAt()))
                .toList();
        return new PageResult<>(items, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    /** FR4-9 (P4-D7): hard delete with file cascade; first call 204, thereafter 404. */
    @DeleteMapping("/{id}/responses/{responseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteResponse(@PathVariable String id, @PathVariable String responseId) {
        service.deleteResponse(id, responseId);
    }

    /**
     * FR4-11 (P4-D3): downloadable export envelope — the DRAFT definition
     * plus the name; publicId, allowedOrigins, responses and version history
     * are deliberately excluded.
     */
    @GetMapping("/{id}/export")
    public ResponseEntity<QuestionnaireExport> export(@PathVariable String id) {
        Questionnaire q = service.get(id);
        Definition draft = q.getDraft() == null ? Definition.empty() : q.getDraft();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(slugOf(q.getName()) + ".json")
                        .build()
                        .toString())
                .contentType(MediaType.APPLICATION_JSON)
                .body(new QuestionnaireExport(QuestionnaireService.EXPORT_VERSION, Instant.now(), q.getName(), draft));
    }

    /** FR4-12 (P4-D3): import always creates — same detail payload as create. */
    @PostMapping("/import")
    @ResponseStatus(HttpStatus.CREATED)
    public QuestionnaireDetail importQuestionnaire(@RequestBody(required = false) QuestionnaireImportRequest request) {
        return toDetail(service.importQuestionnaire(request));
    }

    /**
     * FR4-15/16/17 (P4-D4): streamed CSV export of one version's responses,
     * newest first — UTF-8 with BOM, RFC 4180, attachment. {@code versionNumber}
     * defaults to the current live version; a never-published questionnaire is
     * a 400. Columns derive from the selected version's definition.
     */
    @GetMapping("/{id}/responses/export.csv")
    public void exportCsv(@PathVariable String id,
                          @RequestParam(required = false) String status,
                          @RequestParam(required = false) Integer versionNumber,
                          @RequestParam(required = false) String externalRef,
                          HttpServletResponse httpResponse) throws IOException {
        Questionnaire q = service.get(id);
        if (status != null && !status.isBlank() && !STATUSES.contains(status)) {
            throw ApiException.badRequest("invalid status filter '" + status + "' (must be IN_PROGRESS or COMPLETED)");
        }
        if (versionNumber == null && q.getCurrentVersion() < 1) {
            throw ApiException.badRequest(
                    "questionnaire has never been published — there is no live version to export");
        }
        int selected = versionNumber == null ? q.getCurrentVersion() : versionNumber;
        QuestionnaireVersion version = service.getVersion(id, selected);

        httpResponse.setContentType("text/csv");
        httpResponse.setHeader(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                .filename(slugOf(q.getName()) + "-responses.csv")
                .build()
                .toString());
        try (Stream<ResponseDocument> rows = responseQueries.stream(q.getId(), status, selected, externalRef)) {
            csv.write(version.getDefinition(), rows, httpResponse.getOutputStream());
        }
    }

    /** Download-filename slug: lowercased runs of letters/digits joined by '-'. */
    private static String slugOf(String name) {
        String slug = (name == null ? "" : name)
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+)|(-+$)", "");
        return slug.isEmpty() ? "questionnaire" : slug;
    }

    private static QuestionnaireDetail toDetail(Questionnaire q) {
        return new QuestionnaireDetail(
                q.getId().toHexString(),
                q.getPublicId(),
                q.getName(),
                q.getAllowedOrigins(),
                q.getSubmissionPolicy(),
                q.getCurrentVersion(),
                q.hasUnpublishedChanges(),
                q.getDraft(),
                q.getUpdatedAt());
    }
}
