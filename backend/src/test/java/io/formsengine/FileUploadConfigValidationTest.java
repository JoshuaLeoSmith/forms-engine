package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FILE_UPLOAD publish validation (Phase 3 §5.1): categories, maxFiles 1–10,
 * maxFileSizeMb 1–system cap, helperText length — plus the registry contract
 * that FILE_UPLOAD declares no operators, so any rule condition referencing an
 * upload question is rejected at publish (P3-D6).
 */
class FileUploadConfigValidationTest extends BaseApiTest {

    /** Saves a draft with the given upload config, then publishes expecting failure. */
    private ResponseEntity<Map<String, Object>> publishWithConfig(String name, Map<String, Object> mutations) {
        Map<String, Object> detail = createQuestionnaire(name);
        String id = (String) detail.get("id");
        Map<String, Object> question = Defs.fileUploadQuestion("q1", "resume", List.of("DOCUMENTS"), 1, 10);
        @SuppressWarnings("unchecked")
        Map<String, Object> typeConfig = (Map<String, Object>) question.get("typeConfig");
        typeConfig.putAll(mutations);
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(question)).getStatusCode().value(),
                "draft save is lenient and must accept in-progress configs");
        return publish(id, null);
    }

    private void assertPublishRejected(ResponseEntity<Map<String, Object>> resp, String fragment) {
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), fragment),
                "expected an error containing '" + fragment + "', got: " + errors(resp.getBody()));
    }

    @Test
    void validConfigPublishes() {
        Map<String, Object> detail = createQuestionnaire("FU Valid");
        String id = (String) detail.get("id");
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(
                Defs.fileUploadQuestion("q1", "resume", List.of("DOCUMENTS", "IMAGES"), 10, 50)))
                .getStatusCode().value());
        assertEquals(200, publish(id, null).getStatusCode().value());
    }

    @Test
    void emptyCategoriesIsRejected() {
        assertPublishRejected(publishWithConfig("FU Empty Cats", Map.of("allowedCategories", List.of())),
                "allowedCategories must be a non-empty array");
    }

    @Test
    void unknownCategoryIsRejected() {
        assertPublishRejected(publishWithConfig("FU Bad Cat", Map.of("allowedCategories", List.of("VIDEOS"))),
                "unknown category 'VIDEOS'");
    }

    @Test
    void maxFilesOutOfRangeIsRejected() {
        assertPublishRejected(publishWithConfig("FU MaxFiles 0", Map.of("maxFiles", 0)),
                "maxFiles must be an integer between 1 and 10");
        assertPublishRejected(publishWithConfig("FU MaxFiles 11", Map.of("maxFiles", 11)),
                "maxFiles must be an integer between 1 and 10");
    }

    @Test
    void maxFileSizeOutOfRangeIsRejected() {
        assertPublishRejected(publishWithConfig("FU Size 0", Map.of("maxFileSizeMb", 0)),
                "maxFileSizeMb must be an integer between 1 and 50");
        // 51 exceeds the default system cap (MAX_FILE_SIZE_MB = 50), which also bounds the editor input.
        assertPublishRejected(publishWithConfig("FU Size 51", Map.of("maxFileSizeMb", 51)),
                "maxFileSizeMb must be an integer between 1 and 50");
    }

    @Test
    void overlongHelperTextIsRejected() {
        assertPublishRejected(publishWithConfig("FU Helper", Map.of("helperText", "x".repeat(501))),
                "helperText must be null or a string of at most 500");
    }

    @Test
    void conditionReferencingFileUploadQuestionIsRejected() {
        Map<String, Object> detail = createQuestionnaire("FU Condition");
        String id = (String) detail.get("id");
        Map<String, Object> dependent = Defs.textQuestion("q2", "coverLetter");
        dependent.put("visibility", Defs.conditionalOn("resume", "EQUALS", "anything"));
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(
                Defs.fileUploadQuestion("q1", "resume", List.of("DOCUMENTS"), 1, 10),
                dependent)).getStatusCode().value());
        ResponseEntity<Map<String, Object>> published = publish(id, null);
        assertEquals(400, published.getStatusCode().value());
        assertTrue(anyErrorContains(published.getBody(), "not allowed for FILE_UPLOAD"),
                "conditions can never reference FILE_UPLOAD questions (P3-D6), got: " + errors(published.getBody()));
    }
}
