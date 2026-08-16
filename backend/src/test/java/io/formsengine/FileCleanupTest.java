package io.formsengine;

import io.formsengine.domain.ResponseDocument;
import io.formsengine.domain.UploadedFileDocument;
import io.formsengine.repository.ResponseRepository;
import io.formsengine.service.FileCleanupService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Orphan cleanup (FR3-12, NFR3-3) with the default 24 h grace: grace-expired
 * unreferenced files are collected (storage deleted, then tombstoned),
 * response-less orphans are collected, answer-referenced files of completed
 * responses are permanent, and a just-uploaded file is never eligible.
 * Candidates are aged by backdating {@code createdAt} directly; the scheduled
 * trigger is disabled in tests ({@code forms.uploads.cleanup-enabled=false})
 * and {@link FileCleanupService#runOnce()} is driven explicitly.
 */
class FileCleanupTest extends FileTestSupport {

    @Autowired
    private FileCleanupService cleanup;

    @Autowired
    private ResponseRepository responses;

    private Ctx publishUploadQuestionnaire(String name) {
        return publishQuestionnaire(name,
                Defs.fileUploadQuestion("q1", "resume", List.of("DOCUMENTS"), 5, 10));
    }

    /** Ages a file row past the grace period (auditing only sets createdAt on insert). */
    private void backdate(String fileId, int hours) {
        UploadedFileDocument doc = uploadedFiles.findByFileId(fileId).orElseThrow();
        doc.setCreatedAt(Instant.now().minus(hours, ChronoUnit.HOURS));
        uploadedFiles.save(doc);
    }

    @Test
    void graceExpiredOrphanIsCollected() {
        Ctx ctx = publishUploadQuestionnaire("Cleanup Orphan");
        String responseId = newResponse(ctx.publicId());
        String fileId = (String) upload(responseId, "resume", "orphan.pdf", TestFiles.pdf()).getBody().get("fileId");
        String storageKey = uploadedFiles.findByFileId(fileId).orElseThrow().getStorageKey();
        backdate(fileId, 48);

        FileCleanupService.RunSummary summary = cleanup.runOnce();

        assertTrue(summary.deleted() >= 1, "the aged orphan must be deleted, summary: " + summary);
        UploadedFileDocument doc = uploadedFiles.findByFileId(fileId).orElseThrow();
        assertEquals(UploadedFileDocument.STATUS_DELETED, doc.getStatus());
        assertNotNull(doc.getDeletedAt());
        assertFalse(storage.exists(storageKey), "the storage object must be gone");
    }

    @Test
    void responseDeletedOrphanIsCollected() {
        Ctx ctx = publishUploadQuestionnaire("Cleanup No Response");
        String responseId = newResponse(ctx.publicId());
        String fileId = (String) upload(responseId, "resume", "lost.pdf", TestFiles.pdf()).getBody().get("fileId");
        String storageKey = uploadedFiles.findByFileId(fileId).orElseThrow().getStorageKey();

        ResponseDocument r = responses.findByResponseId(responseId).orElseThrow();
        responses.delete(r);
        backdate(fileId, 48);

        cleanup.runOnce();

        assertEquals(UploadedFileDocument.STATUS_DELETED,
                uploadedFiles.findByFileId(fileId).orElseThrow().getStatus());
        assertFalse(storage.exists(storageKey));
    }

    @Test
    void answerReferencedFileOfCompletedResponseIsPermanent() {
        Ctx ctx = publishUploadQuestionnaire("Cleanup Referenced");
        String responseId = newResponse(ctx.publicId());
        Map<String, Object> ref = upload(responseId, "resume", "keep.pdf", TestFiles.pdf()).getBody();
        String fileId = (String) ref.get("fileId");

        assertEquals(200, patch("/public/v1/responses/" + responseId, Map.of(
                "answers", Map.of("resume", List.of(Map.of(
                        "fileId", fileId,
                        "fileName", ref.get("fileName"),
                        "size", ref.get("size"),
                        "contentType", ref.get("contentType")))))).getStatusCode().value());
        assertEquals(200, post("/public/v1/responses/" + responseId + "/complete", Map.of())
                .getStatusCode().value());
        backdate(fileId, 48);

        cleanup.runOnce();

        UploadedFileDocument doc = uploadedFiles.findByFileId(fileId).orElseThrow();
        assertEquals(UploadedFileDocument.STATUS_ACTIVE, doc.getStatus(),
                "completed-and-referenced files are permanent (FR3-12)");
        assertTrue(storage.exists(doc.getStorageKey()));
    }

    @Test
    void freshUnreferencedFileIsNeverEligible() {
        Ctx ctx = publishUploadQuestionnaire("Cleanup Fresh");
        String responseId = newResponse(ctx.publicId());
        String fileId = (String) upload(responseId, "resume", "fresh.pdf", TestFiles.pdf()).getBody().get("fileId");

        cleanup.runOnce();

        UploadedFileDocument doc = uploadedFiles.findByFileId(fileId).orElseThrow();
        assertEquals(UploadedFileDocument.STATUS_ACTIVE, doc.getStatus(),
                "a file inside the 24 h grace period must never be collected (NFR3-3)");
        assertTrue(storage.exists(doc.getStorageKey()));
    }

    @Test
    void unreferencedFileOfLiveResponseIsCollectedAfterGrace() {
        // Covers the "uploaded, then cleared from answers" path: the response
        // exists, its answers no longer reference the file.
        Ctx ctx = publishUploadQuestionnaire("Cleanup Cleared");
        String responseId = newResponse(ctx.publicId());
        String fileId = (String) upload(responseId, "resume", "cleared.pdf", TestFiles.pdf()).getBody().get("fileId");
        assertEquals(200, patch("/public/v1/responses/" + responseId,
                Map.of("answers", Map.of())).getStatusCode().value());
        backdate(fileId, 48);

        cleanup.runOnce();

        assertEquals(UploadedFileDocument.STATUS_DELETED,
                uploadedFiles.findByFileId(fileId).orElseThrow().getStatus());
    }
}
