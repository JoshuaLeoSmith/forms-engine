package io.formsengine;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * NFR-4 input caps on the public PATCH endpoint (FR-B-4).
 */
class AnswerCapsTest extends BaseApiTest {

    private String responseId;

    @BeforeEach
    void createResponse() {
        Map<String, Object> detail = createQuestionnaire("Caps");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(id, "caps1");
        responseId = (String) post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1)).getBody().get("responseId");
    }

    @Test
    void rejectsAnswerValueOverTenKilobytes() {
        String big = "x".repeat(10 * 1024 + 1);
        ResponseEntity<Map<String, Object>> resp = patch("/public/v1/responses/" + responseId,
                Map.of("answers", Map.of("caps1", big)));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "maximum per answer"));
    }

    @Test
    void rejectsMoreThanFiveHundredKeys() {
        Map<String, Object> answers = new HashMap<>();
        for (int i = 0; i < 501; i++) {
            answers.put("k" + i, "v");
        }
        ResponseEntity<Map<String, Object>> resp = patch("/public/v1/responses/" + responseId,
                Map.of("answers", answers));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "keys"));
    }

    @Test
    void rejectsValuesOutsideTheTypedShapes() {
        // FR2-5: numbers and flat string objects are legal now, but nested
        // objects and null values are not.
        Map<String, Object> nested = new HashMap<>();
        nested.put("caps1", Map.of("inner", Map.of("deep", "no")));
        ResponseEntity<Map<String, Object>> resp = patch("/public/v1/responses/" + responseId,
                Map.of("answers", nested));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "flat object"));

        Map<String, Object> nullValue = new HashMap<>();
        nullValue.put("caps1", null);
        assertEquals(400, patch("/public/v1/responses/" + responseId,
                Map.of("answers", nullValue)).getStatusCode().value());
    }

    @Test
    void rejectsInvalidAnswerKeys() {
        Map<String, Object> answers = new HashMap<>();
        answers.put("9starts-with-digit", "v");
        ResponseEntity<Map<String, Object>> resp = patch("/public/v1/responses/" + responseId,
                Map.of("answers", answers));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "9starts-with-digit"));
    }

    @Test
    void acceptsAnswersJustUnderTheCaps() {
        String almostTenKb = "x".repeat(10 * 1024);
        ResponseEntity<Map<String, Object>> resp = patch("/public/v1/responses/" + responseId,
                Map.of("answers", Map.of("caps1", almostTenKb)));
        assertEquals(200, resp.getStatusCode().value());
    }
}
