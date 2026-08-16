package io.formsengine;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Typed answers on the public PATCH endpoint (FR2-5, §3): values may be a
 * string, finite number, boolean, array of strings (≤ 100) or a flat
 * string-valued object (≤ 20 keys) — and nothing else. The backend does not
 * validate values against the definition's types (explicit Phase-2 non-goal).
 */
class TypedAnswersTest extends BaseApiTest {

    private String questionnaireId;
    private String responseId;

    @BeforeEach
    void createResponse() {
        Map<String, Object> detail = createQuestionnaire("Typed");
        questionnaireId = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(questionnaireId, "typed1");
        responseId = (String) post("/public/v1/questionnaires/" + publicId + "/responses",
                Map.of("versionNumber", 1)).getBody().get("responseId");
    }

    private ResponseEntity<Map<String, Object>> patchAnswers(Map<String, Object> answers) {
        return patch("/public/v1/responses/" + responseId, Map.of("answers", answers));
    }

    @Test
    void acceptsTheSection3ExampleShapesAndRoundTripsThem() {
        Map<String, Object> homeAddr = new LinkedHashMap<>();
        homeAddr.put("country", "US");
        homeAddr.put("line1", "12 Main St");
        homeAddr.put("line2", "");
        homeAddr.put("city", "Woodbury");
        homeAddr.put("state", "NJ");
        homeAddr.put("postalCode", "08096");

        Map<String, Object> answers = new LinkedHashMap<>();
        answers.put("food1", "pizza");
        answers.put("toppings", List.of("Mushroom", "Onion"));
        answers.put("visitDate", "2026-09-14");
        answers.put("partySize", 4);
        answers.put("budgetPct", 12.5);
        answers.put("zeroCount", 0);
        answers.put("newsletter", false);
        answers.put("homeAddr", homeAddr);

        ResponseEntity<Map<String, Object>> resp = patchAnswers(answers);
        assertEquals(200, resp.getStatusCode().value(), "typed answers must be accepted: " + resp.getBody());

        // Round trip through Mongo and the management export: shapes survive.
        Map<String, Object> exported = fetchExportedAnswers();
        assertEquals("pizza", exported.get("food1"));
        assertEquals(List.of("Mushroom", "Onion"), exported.get("toppings"));
        assertEquals("2026-09-14", exported.get("visitDate"));
        assertEquals(4, exported.get("partySize"), "numbers must stay numbers");
        assertEquals(12.5, exported.get("budgetPct"));
        assertEquals(0, exported.get("zeroCount"), "0 is a valid answer");
        assertEquals(Boolean.FALSE, exported.get("newsletter"), "false is a valid answer");
        assertEquals(homeAddr, exported.get("homeAddr"), "address objects must survive unchanged");
    }

    @Test
    void rejectsNestedObjects() {
        ResponseEntity<Map<String, Object>> resp = patchAnswers(
                Map.of("typed1", Map.of("outer", Map.of("inner", "x"))));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "flat object"));
    }

    @Test
    void rejectsArraysOfNonStrings() {
        ResponseEntity<Map<String, Object>> resp = patchAnswers(Map.of("typed1", List.of(1, 2, 3)));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "array of strings"));
    }

    @Test
    void rejectsArraysOverOneHundredElements() {
        List<String> big = new ArrayList<>();
        for (int i = 0; i < 101; i++) {
            big.add("v" + i);
        }
        ResponseEntity<Map<String, Object>> resp = patchAnswers(Map.of("typed1", big));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "100"));
    }

    @Test
    void rejectsObjectsOverTwentyKeys() {
        Map<String, Object> big = new LinkedHashMap<>();
        for (int i = 0; i < 21; i++) {
            big.put("k" + i, "v");
        }
        ResponseEntity<Map<String, Object>> resp = patchAnswers(Map.of("typed1", big));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "20"));
    }

    @Test
    void rejectsNullValues() {
        Map<String, Object> answers = new HashMap<>();
        answers.put("typed1", null);
        ResponseEntity<Map<String, Object>> resp = patchAnswers(answers);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "null"));
    }

    @Test
    void perValueCapAppliesToTheSummedListSize() {
        // 100 elements of ~110 bytes each ≈ 11 KB, over the 10 KB per-answer cap.
        List<String> big = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            big.add("x".repeat(110));
        }
        ResponseEntity<Map<String, Object>> resp = patchAnswers(Map.of("typed1", big));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "maximum per answer"));
    }

    /** Reads the answers map back through the management export endpoint. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchExportedAnswers() {
        ResponseEntity<Map<String, Object>> export = get(
                "/api/v1/questionnaires/" + questionnaireId + "/responses?page=0&size=50");
        assertEquals(200, export.getStatusCode().value());
        List<Map<String, Object>> items = (List<Map<String, Object>>) export.getBody().get("items");
        Map<String, Object> row = items.stream()
                .filter(r -> responseId.equals(r.get("responseId")))
                .findFirst().orElseThrow();
        return (Map<String, Object>) row.get("answers");
    }
}
