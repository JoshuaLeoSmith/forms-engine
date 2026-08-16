package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Public runtime API: live endpoint, response lifecycle, version pinning
 * (FR-B-5, FR-L-8/9/10/11, D-5, D-7).
 */
class PublicResponseLifecycleTest extends BaseApiTest {

    @Test
    void liveIs404BeforePublishAnd200AfterWithNoStore() {
        Map<String, Object> detail = createQuestionnaire("Live");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");

        assertEquals(404, get("/public/v1/questionnaires/" + publicId + "/live").getStatusCode().value());

        draftAndPublish(id, "live1");

        ResponseEntity<Map<String, Object>> live = get("/public/v1/questionnaires/" + publicId + "/live");
        assertEquals(200, live.getStatusCode().value());
        assertEquals("no-store", live.getHeaders().getFirst("Cache-Control"));
        assertEquals(publicId, live.getBody().get("publicId"));
        assertEquals("Live", live.getBody().get("name"));
        assertEquals(1, live.getBody().get("versionNumber"));
        assertNotNull(live.getBody().get("definition"));
    }

    @Test
    void responseLifecycleCreatePatchReplaceCompleteIdempotentConflict() {
        Map<String, Object> detail = createQuestionnaire("Lifecycle");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(id, "life1");

        // Create
        ResponseEntity<Map<String, Object>> created = post(
                "/public/v1/questionnaires/" + publicId + "/responses", Map.of("versionNumber", 1));
        assertEquals(201, created.getStatusCode().value());
        String responseId = (String) created.getBody().get("responseId");
        assertNotNull(responseId);
        assertTrue(responseId.startsWith("r_"));
        assertEquals(34, responseId.length(), "r_ + 32 hex chars of a dashless UUID");

        // First save: two answers + position
        Map<String, Object> patch1 = Map.of(
                "answers", Map.of("life1", "pizza", "extra", "value"),
                "lastPosition", Map.of("stepId", "s1", "tabId", "t1"));
        assertEquals(200, patch("/public/v1/responses/" + responseId, patch1).getStatusCode().value());

        // Full replace (D-7): second save with fewer keys leaves exactly those keys.
        Map<String, Object> patch2 = Map.of("answers", Map.of("life1", "sushi"));
        assertEquals(200, patch("/public/v1/responses/" + responseId, patch2).getStatusCode().value());

        Map<String, Object> exported = fetchExportedResponse(id, responseId);
        @SuppressWarnings("unchecked")
        Map<String, Object> answers = (Map<String, Object>) exported.get("answers");
        assertEquals(Map.of("life1", "sushi"), answers, "answers must be fully replaced, not merged");
        @SuppressWarnings("unchecked")
        Map<String, Object> lastPosition = (Map<String, Object>) exported.get("lastPosition");
        assertEquals("s1", lastPosition.get("stepId"));
        assertEquals("IN_PROGRESS", exported.get("status"));
        assertNull(exported.get("completedAt"));

        // Complete — idempotent (FR-L-11).
        assertEquals(200, post("/public/v1/responses/" + responseId + "/complete", Map.of()).getStatusCode().value());
        Map<String, Object> afterComplete = fetchExportedResponse(id, responseId);
        assertEquals("COMPLETED", afterComplete.get("status"));
        String completedAt = (String) afterComplete.get("completedAt");
        assertNotNull(completedAt);

        assertEquals(200, post("/public/v1/responses/" + responseId + "/complete", Map.of()).getStatusCode().value());
        Map<String, Object> afterSecondComplete = fetchExportedResponse(id, responseId);
        assertEquals(completedAt, afterSecondComplete.get("completedAt"), "second complete must not change completedAt");

        // Patch after completion → 409.
        ResponseEntity<Map<String, Object>> conflict = patch("/public/v1/responses/" + responseId,
                Map.of("answers", Map.of("life1", "late")));
        assertEquals(409, conflict.getStatusCode().value());
        assertEquals(409, conflict.getBody().get("status"));
    }

    @Test
    void versionNumberPinningValidatesRange() {
        Map<String, Object> detail = createQuestionnaire("Pinning");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");

        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("q1", "pin1"))).getStatusCode().value());
        assertEquals(200, publish(id, null).getStatusCode().value());
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("q1", "pin2"))).getStatusCode().value());
        assertEquals(200, publish(id, null).getStatusCode().value());

        // Pinning to the older published version is legal (D-5).
        ResponseEntity<Map<String, Object>> pinned = post(
                "/public/v1/questionnaires/" + publicId + "/responses", Map.of("versionNumber", 1));
        assertEquals(201, pinned.getStatusCode().value());
        String responseId = (String) pinned.getBody().get("responseId");
        Map<String, Object> exported = fetchExportedResponse(id, responseId);
        assertEquals(1, exported.get("versionNumber"));

        assertEquals(400, post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 99)).getStatusCode().value());
        assertEquals(400, post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 0)).getStatusCode().value());
        Map<String, Object> noVersion = new HashMap<>();
        assertEquals(400, post("/public/v1/questionnaires/" + publicId + "/responses", noVersion)
                .getStatusCode().value());
    }

    /** FR4-10: the responses browser filters the list by pinned version. */
    @Test
    void responseListFiltersByVersionNumber() {
        Map<String, Object> detail = createQuestionnaire("Version Filter");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");

        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("q1", "vf1"))).getStatusCode().value());
        assertEquals(200, publish(id, null).getStatusCode().value());
        String v1Response = (String) post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1)).getBody().get("responseId");

        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("q1", "vf2"))).getStatusCode().value());
        assertEquals(200, publish(id, null).getStatusCode().value());
        String v2Response = (String) post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 2)).getBody().get("responseId");
        assertEquals(200, post("/public/v1/responses/" + v2Response + "/complete", Map.of()).getStatusCode().value());

        ResponseEntity<Map<String, Object>> v1Only = get(
                "/api/v1/questionnaires/" + id + "/responses?versionNumber=1");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> v1Items = (List<Map<String, Object>>) v1Only.getBody().get("items");
        assertEquals(1, v1Items.size());
        assertEquals(v1Response, v1Items.get(0).get("responseId"));

        // Version + status combine.
        ResponseEntity<Map<String, Object>> v2Completed = get(
                "/api/v1/questionnaires/" + id + "/responses?versionNumber=2&status=COMPLETED");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> v2Items = (List<Map<String, Object>>) v2Completed.getBody().get("items");
        assertEquals(1, v2Items.size());
        assertEquals(v2Response, v2Items.get(0).get("responseId"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> v1Completed = (List<Map<String, Object>>) get(
                "/api/v1/questionnaires/" + id + "/responses?versionNumber=1&status=COMPLETED")
                .getBody().get("items");
        assertEquals(0, v1Completed.size());
    }

    @Test
    void unknownResponseIdIs404() {
        assertEquals(404, patch("/public/v1/responses/r_doesnotexist", Map.of("answers", Map.of()))
                .getStatusCode().value());
        assertEquals(404, post("/public/v1/responses/r_doesnotexist/complete", Map.of())
                .getStatusCode().value());
    }

    /** Reads one response back through the management export endpoint. */
    private Map<String, Object> fetchExportedResponse(String questionnaireId, String responseId) {
        ResponseEntity<Map<String, Object>> export = get(
                "/api/v1/questionnaires/" + questionnaireId + "/responses?page=0&size=50");
        assertEquals(200, export.getStatusCode().value());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) export.getBody().get("items");
        return items.stream()
                .filter(r -> responseId.equals(r.get("responseId")))
                .findFirst().orElseThrow();
    }
}
