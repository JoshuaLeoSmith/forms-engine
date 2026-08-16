package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * schemaVersion 2 acceptance (FR2-1, NFR-5): both 1 and 2 are accepted for
 * draft save and publish; published versions keep the schemaVersion they were
 * published with; unknown versions stay rejected.
 */
class SchemaVersionTest extends BaseApiTest {

    @Test
    void schemaVersion2DraftSavesPublishesAndIsKeptOnTheVersion() {
        String id = (String) createQuestionnaire("Schema V2").get("id");
        Map<String, Object> def = Defs.definitionWithQuestions(Defs.textQuestion("q1", "v2q"));
        def.put("schemaVersion", 2);

        assertEquals(200, putDraft(id, def).getStatusCode().value());
        assertEquals(200, publish(id, "v2 publish").getStatusCode().value());

        ResponseEntity<Map<String, Object>> version = get("/api/v1/questionnaires/" + id + "/versions/1");
        assertEquals(200, version.getStatusCode().value());
        @SuppressWarnings("unchecked")
        Map<String, Object> definition = (Map<String, Object>) version.getBody().get("definition");
        assertEquals(2, definition.get("schemaVersion"), "published versions keep their schemaVersion");
    }

    @Test
    void schemaVersion1StillPublishes() {
        String id = (String) createQuestionnaire("Schema V1").get("id");
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("q1", "v1q"))).getStatusCode().value());
        assertEquals(200, publish(id, null).getStatusCode().value());

        ResponseEntity<Map<String, Object>> version = get("/api/v1/questionnaires/" + id + "/versions/1");
        @SuppressWarnings("unchecked")
        Map<String, Object> definition = (Map<String, Object>) version.getBody().get("definition");
        assertEquals(1, definition.get("schemaVersion"));
    }

    @Test
    void schemaVersion3IsRejected() {
        String id = (String) createQuestionnaire("Schema V3 No").get("id");
        Map<String, Object> def = Defs.definitionWithQuestions(Defs.textQuestion("q1", "v3q"));
        def.put("schemaVersion", 3);
        ResponseEntity<Map<String, Object>> resp = putDraft(id, def);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "schemaVersion 3"));
    }
}
