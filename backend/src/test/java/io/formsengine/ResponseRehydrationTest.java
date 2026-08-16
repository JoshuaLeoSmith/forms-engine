package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * FR4-2 (P4-D1): the public rehydration GET — status, answers, lastPosition
 * and the <b>pinned</b> version's full definition embedded in the payload, so
 * a refreshed session resumes against the version it started on even after
 * newer publishes. Origin behavior mirrors the live GET: data regardless, CORS
 * allow header only for allowed origins.
 */
class ResponseRehydrationTest extends BaseApiTest {

    /** Creates + publishes v1 with a single text question of the given code. Returns [id, publicId]. */
    private String[] publishedQuestionnaire(String name, String code) {
        Map<String, Object> detail = createQuestionnaire(name);
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(id, code);
        return new String[]{id, publicId};
    }

    private String newResponse(String publicId, int versionNumber) {
        ResponseEntity<Map<String, Object>> created = post(
                "/public/v1/questionnaires/" + publicId + "/responses", Map.of("versionNumber", versionNumber));
        assertEquals(201, created.getStatusCode().value());
        return (String) created.getBody().get("responseId");
    }

    @Test
    @SuppressWarnings("unchecked")
    void rehydrationReturnsPinnedDefinitionNotLatest() {
        String[] q = publishedQuestionnaire("Rehydrate Pinned", "v1code");
        String id = q[0];
        String publicId = q[1];
        String responseId = newResponse(publicId, 1);

        // Save answers + position, then publish v2 with a different question.
        assertEquals(200, patch("/public/v1/responses/" + responseId, Map.of(
                "answers", Map.of("v1code", "hello"),
                "lastPosition", Map.of("stepId", "s1", "tabId", "t2"))).getStatusCode().value());
        assertEquals(200, putDraft(id,
                Defs.definitionWithQuestions(Defs.textQuestion("id-v2code", "v2code"))).getStatusCode().value());
        assertEquals(200, publish(id, "v2").getStatusCode().value());

        ResponseEntity<Map<String, Object>> resp = get("/public/v1/responses/" + responseId);
        assertEquals(200, resp.getStatusCode().value());
        Map<String, Object> body = resp.getBody();
        assertEquals("IN_PROGRESS", body.get("status"));
        assertEquals(1, body.get("versionNumber"), "the response stays pinned to v1");
        assertEquals(Map.of("v1code", "hello"), body.get("answers"));
        Map<String, Object> lastPosition = (Map<String, Object>) body.get("lastPosition");
        assertEquals("s1", lastPosition.get("stepId"));
        assertEquals("t2", lastPosition.get("tabId"));

        Map<String, Object> definition = (Map<String, Object>) body.get("definition");
        List<Map<String, Object>> questions = (List<Map<String, Object>>) definition.get("questions");
        assertEquals(1, questions.size());
        assertEquals("v1code", questions.get(0).get("code"),
                "the embedded definition must be the pinned v1, not the latest v2");
        assertEquals("no-store", resp.getHeaders().getFirst("Cache-Control"));

        // A fresh live GET meanwhile serves v2 — the two coexist.
        ResponseEntity<Map<String, Object>> live = get("/public/v1/questionnaires/" + publicId + "/live");
        assertEquals(2, live.getBody().get("versionNumber"));
    }

    @Test
    void rehydrationOfCompletedResponseReportsCompleted() {
        String[] q = publishedQuestionnaire("Rehydrate Completed", "done1");
        String responseId = newResponse(q[1], 1);
        assertEquals(200, post("/public/v1/responses/" + responseId + "/complete", Map.of())
                .getStatusCode().value());

        ResponseEntity<Map<String, Object>> resp = get("/public/v1/responses/" + responseId);
        assertEquals(200, resp.getStatusCode().value());
        assertEquals("COMPLETED", resp.getBody().get("status"));
    }

    @Test
    void rehydrationOfUnknownResponseIs404() {
        ResponseEntity<Map<String, Object>> resp = get("/public/v1/responses/r_does_not_exist");
        assertEquals(404, resp.getStatusCode().value());
        assertEquals(404, resp.getBody().get("status"));
    }

    /**
     * The rehydration 404 is the embed's sessionStorage reset signal (FR4-3,
     * P4-D7) — the browser must be able to READ the status cross-origin, so
     * the origin is echoed on the not-found path (no data is exposed).
     */
    @Test
    void rehydration404EchoesOriginSoTheBrowserCanReadTheResetSignal() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Origin", "https://any.example");
        ResponseEntity<Map<String, Object>> resp = exchange(HttpMethod.GET,
                "/public/v1/responses/r_deleted_or_unknown", null, headers);
        assertEquals(404, resp.getStatusCode().value());
        assertEquals("https://any.example", resp.getHeaders().getFirst("Access-Control-Allow-Origin"));
    }

    @Test
    void rehydrationAfterQuestionnaireDeletionIs404() {
        // Deleting the questionnaire removes its versions; the orphaned
        // response's rehydration 404s — the FR4-3 sessionStorage reset signal.
        String[] q = publishedQuestionnaire("Rehydrate Orphan", "orph1");
        String responseId = newResponse(q[1], 1);
        assertEquals(204, exchange(HttpMethod.DELETE, "/api/v1/questionnaires/" + q[0], null, null)
                .getStatusCode().value());

        assertEquals(404, get("/public/v1/responses/" + responseId).getStatusCode().value());
    }

    @Test
    void rehydrationEchoesCorsHeaderOnlyForAllowedOrigins() {
        String[] q = publishedQuestionnaire("Rehydrate Origins", "orig2");
        assertEquals(200, patch("/api/v1/questionnaires/" + q[0],
                Map.of("allowedOrigins", List.of("https://allowed.example"))).getStatusCode().value());
        String responseId = newResponse(q[1], 1);

        HttpHeaders allowed = new HttpHeaders();
        allowed.set("Origin", "https://allowed.example");
        ResponseEntity<Map<String, Object>> ok = exchange(HttpMethod.GET,
                "/public/v1/responses/" + responseId, null, allowed);
        assertEquals(200, ok.getStatusCode().value());
        assertEquals("https://allowed.example", ok.getHeaders().getFirst("Access-Control-Allow-Origin"));

        HttpHeaders evil = new HttpHeaders();
        evil.set("Origin", "https://evil.example");
        ResponseEntity<Map<String, Object>> blocked = exchange(HttpMethod.GET,
                "/public/v1/responses/" + responseId, null, evil);
        assertEquals(200, blocked.getStatusCode().value(),
                "the GET still returns data (the browser blocks the read)");
        assertNull(blocked.getHeaders().getFirst("Access-Control-Allow-Origin"));
    }
}
