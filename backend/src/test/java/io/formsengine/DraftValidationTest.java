package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Draft (lenient) validation on PUT /draft (FR-B-1, NFR-5, BRD 5.1/5.3).
 */
class DraftValidationTest extends BaseApiTest {

    @Test
    void validDraftSaves() {
        String id = (String) createQuestionnaire("Draft OK").get("id");
        ResponseEntity<Map<String, Object>> resp = putDraft(id, Defs.definitionWithQuestions(
                Defs.textQuestion("q1", "food1"),
                Defs.radioQuestion("q2", "food2", "Cake", "Ice Cream")));
        assertEquals(200, resp.getStatusCode().value());
        @SuppressWarnings("unchecked")
        Map<String, Object> draft = (Map<String, Object>) resp.getBody().get("draft");
        assertEquals(2, ((List<?>) draft.get("questions")).size());
        assertEquals(Boolean.TRUE, resp.getBody().get("hasUnpublishedChanges"));
    }

    @Test
    void draftIsLenientAboutIncompleteConfigAndDanglingRules() {
        String id = (String) createQuestionnaire("Draft Lenient").get("id");
        // Radio mid-edit with zero options, and a rule referencing a code that
        // does not exist yet: both legal in a draft.
        Map<String, Object> radio = Defs.radioQuestion("q1", "radio1");
        Map<String, Object> text = Defs.textQuestion("q2", "text1");
        text.put("visibility", Defs.conditionalOn("notYetCreated", "EQUALS", "yes"));
        ResponseEntity<Map<String, Object>> resp = putDraft(id, Defs.definitionWithQuestions(radio, text));
        assertEquals(200, resp.getStatusCode().value());
    }

    @Test
    void rejectsBadCodePattern() {
        String id = (String) createQuestionnaire("Bad Code").get("id");
        ResponseEntity<Map<String, Object>> resp = putDraft(id,
                Defs.definitionWithQuestions(Defs.textQuestion("q1", "1starts-with-digit")));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "1starts-with-digit"));
    }

    @Test
    void rejectsDuplicateCodes() {
        String id = (String) createQuestionnaire("Dup Codes").get("id");
        ResponseEntity<Map<String, Object>> resp = putDraft(id, Defs.definitionWithQuestions(
                Defs.textQuestion("q1", "same"),
                Defs.textQuestion("q2", "same")));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "same"));
    }

    @Test
    void rejectsUnknownType() {
        String id = (String) createQuestionnaire("Unknown Type").get("id");
        Map<String, Object> q = Defs.textQuestion("q1", "matrix1");
        q.put("type", "MATRIX");
        ResponseEntity<Map<String, Object>> resp = putDraft(id, Defs.definitionWithQuestions(q));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "MATRIX"));
    }

    @Test
    void rejectsUnknownSchemaVersion() {
        String id = (String) createQuestionnaire("Schema V3").get("id");
        Map<String, Object> def = Defs.definitionWithQuestions(Defs.textQuestion("q1", "a1"));
        def.put("schemaVersion", 3);
        ResponseEntity<Map<String, Object>> resp = putDraft(id, def);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "schemaVersion"));
    }

    @Test
    void rejectsMultipleTopLevelCollections() {
        String id = (String) createQuestionnaire("Structure").get("id");
        Map<String, Object> def = Defs.definitionWithQuestions(Defs.textQuestion("q1", "a1"));
        def.put("steps", List.of(Map.of("id", "s1", "title", "Step 1",
                "tabs", List.of(), "questions", List.of())));
        ResponseEntity<Map<String, Object>> resp = putDraft(id, def);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "at most one"));
    }

    @Test
    void errorBodyHasStandardShape() {
        String id = (String) createQuestionnaire("Error Shape").get("id");
        ResponseEntity<Map<String, Object>> resp = putDraft(id,
                Defs.definitionWithQuestions(Defs.textQuestion("q1", "bad code!")));
        assertEquals(400, resp.getStatusCode().value());
        Map<String, Object> body = resp.getBody();
        assertEquals(400, body.get("status"));
        assertTrue(body.get("message") instanceof String);
        assertTrue(body.get("errors") instanceof List<?>);
    }
}
