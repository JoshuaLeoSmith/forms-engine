package io.formsengine;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FR3-9 (amends FR2-5): a PATCH answers array may be an array of strings or an
 * array of file reference objects with exactly the keys fileId, fileName, size
 * and contentType — never mixed, never with missing/extra keys or a
 * non-numeric size. Shape validation is definition-independent, like the rest
 * of FR2-5.
 */
class FileAnswerShapeTest extends BaseApiTest {

    private String responseId;

    @BeforeEach
    void setUp() {
        Map<String, Object> detail = createQuestionnaire("Answer Shapes P3");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(id, "shape3");
        ResponseEntity<Map<String, Object>> created = post(
                "/public/v1/questionnaires/" + publicId + "/responses", Map.of("versionNumber", 1));
        assertEquals(201, created.getStatusCode().value());
        responseId = (String) created.getBody().get("responseId");
    }

    private ResponseEntity<Map<String, Object>> patchAnswer(Object value) {
        return patch("/public/v1/responses/" + responseId, Map.of("answers", Map.of("resume", value)));
    }

    private static Map<String, Object> reference() {
        Map<String, Object> ref = new HashMap<>();
        ref.put("fileId", "f_0123456789abcdef0123456789abcdef");
        ref.put("fileName", "resume.pdf");
        ref.put("size", 482113);
        ref.put("contentType", "application/pdf");
        return ref;
    }

    @Test
    void validFileReferenceArrayIsAccepted() {
        assertEquals(200, patchAnswer(List.of(reference())).getStatusCode().value());
        assertEquals(200, patchAnswer(List.of(reference(), reference())).getStatusCode().value());
    }

    @Test
    void plainStringArraysStillWork() {
        assertEquals(200, patchAnswer(List.of("a", "b")).getStatusCode().value());
    }

    @Test
    void missingKeyIs400() {
        Map<String, Object> ref = reference();
        ref.remove("size");
        ResponseEntity<Map<String, Object>> resp = patchAnswer(List.of(ref));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "exactly the keys"));
    }

    @Test
    void extraKeyIs400() {
        Map<String, Object> ref = reference();
        ref.put("storageKey", "should/never/appear");
        ResponseEntity<Map<String, Object>> resp = patchAnswer(List.of(ref));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "exactly the keys"));
    }

    @Test
    void nonNumericSizeIs400() {
        Map<String, Object> ref = reference();
        ref.put("size", "482113");
        ResponseEntity<Map<String, Object>> resp = patchAnswer(List.of(ref));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "finite numeric 'size'"));
    }

    @Test
    void nonStringMetadataIs400() {
        Map<String, Object> ref = reference();
        ref.put("fileName", 42);
        ResponseEntity<Map<String, Object>> resp = patchAnswer(List.of(ref));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "string 'fileName'"));
    }

    @Test
    void mixedStringAndObjectArrayIs400() {
        ResponseEntity<Map<String, Object>> resp = patchAnswer(List.of("plain", reference()));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "must not mix"));

        ResponseEntity<Map<String, Object>> reversed = patchAnswer(List.of(reference(), "plain"));
        assertEquals(400, reversed.getStatusCode().value());
        assertTrue(anyErrorContains(reversed.getBody(), "must not mix"));
    }

    @Test
    void arrayElementsOfOtherTypesStay400() {
        ResponseEntity<Map<String, Object>> resp = patchAnswer(List.of(1, 2, 3));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "is neither"));
    }
}
