package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * FR5-8/9/10 (P5-D1): the ref-status endpoint returns a completion boolean and
 * nothing else — no responseId, no answers, no in-progress signal — and
 * answers byte-identically for every flavor of "nothing to see here", so it
 * cannot be used to enumerate anything beyond the accepted completed-yes/no
 * residual.
 */
class RefStatusTest extends BaseApiTest {

    private ResponseEntity<String> refStatusRaw(String publicId, String ref) {
        return rest.getForEntity("/public/v1/questionnaires/" + publicId + "/ref-status?ref=" + ref, String.class);
    }

    @Test
    void refStatusReturnsOnlyTheBoolean() {
        Map<String, Object> detail = createQuestionnaire("Ref Status");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(id, "rs1");

        String responseId = (String) post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1, "externalRef", "user-1")).getBody().get("responseId");

        // In progress → NONE: the in-progress state must not leak (FR5-9).
        ResponseEntity<Map<String, Object>> inProgress = get(
                "/public/v1/questionnaires/" + publicId + "/ref-status?ref=user-1");
        assertEquals(200, inProgress.getStatusCode().value());
        assertEquals(Map.of("status", "NONE"), inProgress.getBody(),
                "the payload must contain the status key and nothing else");

        assertEquals(200, post("/public/v1/responses/" + responseId + "/complete", Map.of()).getStatusCode().value());

        ResponseEntity<Map<String, Object>> completed = get(
                "/public/v1/questionnaires/" + publicId + "/ref-status?ref=user-1");
        assertEquals(Map.of("status", "COMPLETED"), completed.getBody(),
                "COMPLETED, and still nothing but the status key — never a responseId");
    }

    @Test
    void allNoneAnswersAreByteIdentical() {
        Map<String, Object> detail = createQuestionnaire("Ref Status None");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(id, "rs2");
        post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1, "externalRef", "incomplete-1"));

        String unknownQuestionnaire = refStatusRaw("q_doesnotexist", "any").getBody();
        String unknownRef = refStatusRaw(publicId, "never-seen").getBody();
        String inProgressRef = refStatusRaw(publicId, "incomplete-1").getBody();
        String overLongRef = refStatusRaw(publicId, "x".repeat(200)).getBody();

        assertNotNull(unknownQuestionnaire);
        assertEquals(unknownQuestionnaire, unknownRef,
                "nonexistent questionnaire and unknown ref must answer identically (FR5-10)");
        assertEquals(unknownQuestionnaire, inProgressRef,
                "a real-but-incomplete ref must be indistinguishable from an unknown one");
        assertEquals(unknownQuestionnaire, overLongRef,
                "an over-long ref can never exist, so it answers NONE rather than erroring");
    }

    @Test
    void missingRefParameterIs400() {
        ResponseEntity<Map<String, Object>> resp = get("/public/v1/questionnaires/q_x/ref-status");
        assertEquals(400, resp.getStatusCode().value());
    }
}
