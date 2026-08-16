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
 * Per-questionnaire origin enforcement on the public API (FR-B-3).
 */
class OriginEnforcementTest extends BaseApiTest {

    private static final String ALLOWED = "https://allowed.example";
    private static final String EVIL = "https://evil.example";

    /** Creates + publishes a questionnaire restricted to {@link #ALLOWED}. Returns [id, publicId]. */
    private String[] restrictedQuestionnaire(String name) {
        Map<String, Object> detail = createQuestionnaire(name);
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        assertEquals(200, patch("/api/v1/questionnaires/" + id,
                Map.of("allowedOrigins", List.of(ALLOWED))).getStatusCode().value());
        draftAndPublish(id, "orig1");
        return new String[]{id, publicId};
    }

    private HttpHeaders origin(String origin) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Origin", origin);
        return headers;
    }

    @Test
    void mutatingRequestFromDisallowedOriginIs403() {
        String publicId = restrictedQuestionnaire("Evil Blocked")[1];
        ResponseEntity<Map<String, Object>> resp = exchange(HttpMethod.POST,
                "/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1), origin(EVIL));
        assertEquals(403, resp.getStatusCode().value());
        assertEquals(403, resp.getBody().get("status"));
        assertNull(resp.getHeaders().getFirst("Access-Control-Allow-Origin"));
    }

    @Test
    void mutatingRequestFromAllowedOriginSucceedsWithEchoedHeader() {
        String publicId = restrictedQuestionnaire("Allowed OK")[1];
        ResponseEntity<Map<String, Object>> resp = exchange(HttpMethod.POST,
                "/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1), origin(ALLOWED));
        assertEquals(201, resp.getStatusCode().value());
        assertEquals(ALLOWED, resp.getHeaders().getFirst("Access-Control-Allow-Origin"));
    }

    @Test
    void requestWithoutOriginHeaderIsAllowed() {
        String publicId = restrictedQuestionnaire("No Origin")[1];
        ResponseEntity<Map<String, Object>> resp = post(
                "/public/v1/questionnaires/" + publicId + "/responses", Map.of("versionNumber", 1));
        assertEquals(201, resp.getStatusCode().value());
    }

    @Test
    void liveGetReturnsDataButWithholdsCorsHeaderForDisallowedOrigin() {
        String publicId = restrictedQuestionnaire("Live Origins")[1];

        ResponseEntity<Map<String, Object>> blocked = exchange(HttpMethod.GET,
                "/public/v1/questionnaires/" + publicId + "/live", null, origin(EVIL));
        assertEquals(200, blocked.getStatusCode().value(), "GET live still returns data (browser blocks the read)");
        assertNull(blocked.getHeaders().getFirst("Access-Control-Allow-Origin"));

        ResponseEntity<Map<String, Object>> allowed = exchange(HttpMethod.GET,
                "/public/v1/questionnaires/" + publicId + "/live", null, origin(ALLOWED));
        assertEquals(200, allowed.getStatusCode().value());
        assertEquals(ALLOWED, allowed.getHeaders().getFirst("Access-Control-Allow-Origin"));
    }

    @Test
    void patchAndCompleteEnforceOriginToo() {
        String[] q = restrictedQuestionnaire("Patch Origins");
        String publicId = q[1];
        String responseId = (String) post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1)).getBody().get("responseId");

        assertEquals(403, exchange(HttpMethod.PATCH, "/public/v1/responses/" + responseId,
                Map.of("answers", Map.of("orig1", "x")), origin(EVIL)).getStatusCode().value());
        assertEquals(403, exchange(HttpMethod.POST, "/public/v1/responses/" + responseId + "/complete",
                Map.of(), origin(EVIL)).getStatusCode().value());

        assertEquals(200, exchange(HttpMethod.PATCH, "/public/v1/responses/" + responseId,
                Map.of("answers", Map.of("orig1", "x")), origin(ALLOWED)).getStatusCode().value());
    }

    @Test
    void emptyAllowedOriginsMeansAllowAll() {
        Map<String, Object> detail = createQuestionnaire("Open To All");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(id, "open1");

        ResponseEntity<Map<String, Object>> resp = exchange(HttpMethod.POST,
                "/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1), origin(EVIL));
        assertEquals(201, resp.getStatusCode().value());
        assertEquals(EVIL, resp.getHeaders().getFirst("Access-Control-Allow-Origin"));
    }

    @Test
    void preflightOptionsIsPermissive() {
        ResponseEntity<Map<String, Object>> resp = exchange(HttpMethod.OPTIONS,
                "/public/v1/responses/r_whatever", null, origin(EVIL));
        assertEquals(204, resp.getStatusCode().value());
        assertEquals(EVIL, resp.getHeaders().getFirst("Access-Control-Allow-Origin"));
        // DELETE: respondent file removal, Phase 3 FR3-10/11.
        assertEquals("GET,POST,PATCH,DELETE,OPTIONS", resp.getHeaders().getFirst("Access-Control-Allow-Methods"));
        assertEquals("Content-Type", resp.getHeaders().getFirst("Access-Control-Allow-Headers"));
        assertEquals("3600", resp.getHeaders().getFirst("Access-Control-Max-Age"));
    }
}
