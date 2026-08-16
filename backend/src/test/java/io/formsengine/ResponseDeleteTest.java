package io.formsengine;

import io.formsengine.domain.UploadedFileDocument;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FR4-9 (P4-D7): response hard delete with file cascade — the answer document
 * is erased, ACTIVE files lose their storage objects and are tombstoned, the
 * public rehydration GET 404s (the FR4-3 reset signal), and the second DELETE
 * 404s. The response must belong to the addressed questionnaire.
 */
class ResponseDeleteTest extends FileTestSupport {

    private ResponseEntity<Map<String, Object>> deleteResponse(String questionnaireId, String responseId) {
        return exchange(HttpMethod.DELETE,
                "/api/v1/questionnaires/" + questionnaireId + "/responses/" + responseId, null, null);
    }

    @Test
    void deleteCascadesToFilesAndIsGoneAfterwards() {
        Ctx ctx = publishQuestionnaire("Delete Cascade",
                Defs.fileUploadQuestion("q1", "evidence", List.of("DOCUMENTS"), 2, 10),
                Defs.textQuestion("q2", "fullName"));
        String responseId = newResponse(ctx.publicId());

        // A real upload through the public multipart endpoint plus an answer.
        ResponseEntity<Map<String, Object>> uploaded = upload(responseId, "evidence", "proof.pdf", TestFiles.pdf());
        assertEquals(201, uploaded.getStatusCode().value());
        String fileId = (String) uploaded.getBody().get("fileId");
        String storageKey = uploadedFiles.findByFileId(fileId).orElseThrow().getStorageKey();
        assertTrue(storage.exists(storageKey), "precondition: the storage object exists");
        assertEquals(200, patch("/public/v1/responses/" + responseId,
                Map.of("answers", Map.of("fullName", "Jane Doe"))).getStatusCode().value());

        // First DELETE: 204.
        assertEquals(204, deleteResponse(ctx.id(), responseId).getStatusCode().value());

        // Storage object gone, tombstone written.
        assertFalse(storage.exists(storageKey), "the storage object must be deleted");
        UploadedFileDocument tombstone = uploadedFiles.findByFileId(fileId).orElseThrow();
        assertEquals(UploadedFileDocument.STATUS_DELETED, tombstone.getStatus());
        assertNotNull(tombstone.getDeletedAt());

        // The response document is gone: the public GET 404s (FR4-3 reset)...
        assertEquals(404, get("/public/v1/responses/" + responseId).getStatusCode().value());
        // ...it no longer appears in the management browse...
        ResponseEntity<Map<String, Object>> listed = get("/api/v1/questionnaires/" + ctx.id() + "/responses");
        assertEquals(0L, ((Number) listed.getBody().get("total")).longValue());
        // ...and the second DELETE is a 404.
        assertEquals(404, deleteResponse(ctx.id(), responseId).getStatusCode().value());
    }

    @Test
    void deleteWorksForCompletedResponses() {
        // Erasure has legal weight — completion must not shield a response.
        Ctx ctx = publishQuestionnaire("Delete Completed", Defs.textQuestion("q1", "answer1"));
        String responseId = newResponse(ctx.publicId());
        assertEquals(200, post("/public/v1/responses/" + responseId + "/complete", Map.of())
                .getStatusCode().value());

        assertEquals(204, deleteResponse(ctx.id(), responseId).getStatusCode().value());
        assertEquals(404, get("/public/v1/responses/" + responseId).getStatusCode().value());
    }

    @Test
    void deleteThroughTheWrongQuestionnaireIs404AndDeletesNothing() {
        Ctx owner = publishQuestionnaire("Delete Owner", Defs.textQuestion("q1", "own1"));
        Ctx other = publishQuestionnaire("Delete Other", Defs.textQuestion("q1", "oth1"));
        String responseId = newResponse(owner.publicId());

        assertEquals(404, deleteResponse(other.id(), responseId).getStatusCode().value(),
                "a response of another questionnaire must be indistinguishable from a missing one");
        assertEquals(200, get("/public/v1/responses/" + responseId).getStatusCode().value(),
                "the response must survive the misdirected delete");
    }

    @Test
    void deleteOfUnknownResponseIs404() {
        Ctx ctx = publishQuestionnaire("Delete Unknown", Defs.textQuestion("q1", "unk1"));
        ResponseEntity<Map<String, Object>> resp = deleteResponse(ctx.id(), "r_does_not_exist");
        assertEquals(404, resp.getStatusCode().value());
        assertEquals(404, resp.getBody().get("status"));
    }
}
