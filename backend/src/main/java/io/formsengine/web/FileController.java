package io.formsengine.web;

import io.formsengine.domain.ResponseDocument;
import io.formsengine.domain.UploadedFileDocument;
import io.formsengine.service.FileService;
import io.formsengine.service.OriginService;
import io.formsengine.service.PublicResponseService;
import io.formsengine.web.dto.ManagementDtos.FileStats;
import io.formsengine.web.dto.ManagementDtos.UploadsConfig;
import io.formsengine.web.dto.PublicDtos.FileReference;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

/**
 * The entire upload path in one controller (Phase 3 §1 isolation obligation,
 * §6): public multipart upload and respondent removal, plus the management
 * download, per-questionnaire file stats, and the editor's caps endpoint.
 *
 * <p>Origin enforcement on the public endpoints mirrors
 * {@link PublicController} (FR-B-3). Downloads exist only on the management
 * API, always as attachment with {@code nosniff} (FR3-23) — this single rule
 * neutralizes stored-content script injection via uploads.
 */
@RestController
public class FileController {

    private final FileService fileService;
    private final PublicResponseService responseService;
    private final OriginService origins;

    public FileController(FileService fileService, PublicResponseService responseService, OriginService origins) {
        this.fileService = fileService;
        this.responseService = responseService;
        this.origins = origins;
    }

    /** §6: multipart upload, parts {@code file} + {@code questionCode}; returns the §4.2 reference object. */
    @PostMapping(path = "/public/v1/responses/{responseId}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public FileReference upload(@PathVariable String responseId,
                                @RequestPart("file") MultipartFile file,
                                @RequestParam("questionCode") String questionCode,
                                @RequestHeader(value = "Origin", required = false) String origin,
                                HttpServletResponse httpResponse) {
        enforceOriginForResponse(responseId, origin, httpResponse);
        return fileService.upload(responseId, questionCode, file);
    }

    /** FR3-10: respondent removal; idempotent; 409 once the response is completed. */
    @DeleteMapping("/public/v1/responses/{responseId}/files/{fileId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String responseId,
                       @PathVariable String fileId,
                       @RequestHeader(value = "Origin", required = false) String origin,
                       HttpServletResponse httpResponse) {
        enforceOriginForResponse(responseId, origin, httpResponse);
        fileService.deleteFile(responseId, fileId);
    }

    /**
     * FR3-23: management-only download — attachment with the sanitized
     * filename, {@code nosniff}, the verified content type, and the stored
     * size. Storage keys never appear in any API response.
     */
    @GetMapping("/api/v1/questionnaires/{id}/responses/{responseId}/files/{fileId}")
    public ResponseEntity<InputStreamResource> download(@PathVariable String id,
                                                        @PathVariable String responseId,
                                                        @PathVariable String fileId) {
        FileService.Download download = fileService.download(id, responseId, fileId);
        UploadedFileDocument file = download.file();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(file.getFileName(), StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(file.getContentType()))
                .contentLength(file.getSize())
                .body(new InputStreamResource(download.content()));
    }

    /** FR3-13: retained file count + bytes for the deletion-confirmation dialog. */
    @GetMapping("/api/v1/questionnaires/{id}/files/stats")
    public FileStats stats(@PathVariable String id) {
        return fileService.stats(id);
    }

    /** FR3-15: the env-tunable upload caps the editor displays and validates against. */
    @GetMapping("/api/v1/uploads/config")
    public UploadsConfig uploadsConfig() {
        return fileService.uploadsConfig();
    }

    /** Same origin rule as {@link PublicController}: orphaned responses skip the check. */
    private void enforceOriginForResponse(String responseId, String origin, HttpServletResponse httpResponse) {
        if (origin == null || origin.isBlank()) {
            return;
        }
        ResponseDocument r = responseService.getResponse(responseId);
        responseService.findQuestionnaire(r.getPublicId()).ifPresent(q -> {
            if (!origins.isAllowed(q, origin)) {
                throw ApiException.forbidden("origin '" + origin + "' is not allowed for this questionnaire");
            }
            origins.applyCorsHeaders(q, origin, httpResponse);
        });
    }
}
