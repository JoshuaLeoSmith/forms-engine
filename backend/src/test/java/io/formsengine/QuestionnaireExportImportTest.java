package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FR4-11/FR4-12 (P4-D3): questionnaire export/import. Export is a downloadable
 * envelope of the DRAFT definition that deliberately strips publicId, origins,
 * responses and version history; import always creates a fresh unpublished
 * questionnaire, never overwrites, never auto-publishes, and rejects unknown
 * envelope/schema versions and publish-invalid definitions outright.
 */
class QuestionnaireExportImportTest extends BaseApiTest {

    /** A publish-valid export envelope built by hand. */
    private static Map<String, Object> exportEnvelope(String name, Map<String, Object> definition) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("formsEngineExport", 1);
        body.put("exportedAt", "2026-08-04T12:00:00Z");
        body.put("name", name);
        body.put("definition", definition);
        return body;
    }

    private long questionnaireCount() {
        return ((Number) get("/api/v1/questionnaires?size=1").getBody().get("total")).longValue();
    }

    @Test
    @SuppressWarnings("unchecked")
    void exportCarriesTheDraftAndStripsEnvironmentSpecificFields() {
        Map<String, Object> detail = createQuestionnaire("Export Shape");
        String id = (String) detail.get("id");
        assertEquals(200, patch("/api/v1/questionnaires/" + id,
                Map.of("allowedOrigins", List.of("https://prod.example"))).getStatusCode().value());
        assertEquals(200, putDraft(id,
                Defs.definitionWithQuestions(Defs.textQuestion("id-exp1", "exp1"))).getStatusCode().value());

        ResponseEntity<Map<String, Object>> resp = get("/api/v1/questionnaires/" + id + "/export");
        assertEquals(200, resp.getStatusCode().value());
        String disposition = resp.getHeaders().getFirst("Content-Disposition");
        assertNotNull(disposition);
        assertTrue(disposition.startsWith("attachment"), "export must download as an attachment");
        assertTrue(disposition.contains("export-shape.json"), "filename must be the slug, got: " + disposition);

        Map<String, Object> body = resp.getBody();
        assertEquals(1, body.get("formsEngineExport"));
        assertNotNull(body.get("exportedAt"), "exportedAt must be present");
        assertTrue(body.get("exportedAt") instanceof String, "exportedAt must serialize as an ISO-8601 string");
        assertEquals("Export Shape", body.get("name"));
        Map<String, Object> definition = (Map<String, Object>) body.get("definition");
        assertEquals(1, definition.get("schemaVersion"));
        assertEquals("exp1", ((List<Map<String, Object>>) definition.get("questions")).get(0).get("code"));

        // P4-D3: the trap fields stay home.
        assertFalse(body.containsKey("publicId"), "export must not leak the publicId");
        assertFalse(body.containsKey("allowedOrigins"), "export must not carry environment-specific origins");
        assertFalse(body.containsKey("responses"));
        assertFalse(body.containsKey("versions"));
        assertFalse(body.containsKey("currentVersion"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void importCreatesAFreshUnpublishedQuestionnaire() {
        ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires/import",
                exportEnvelope("Imported Fresh", Defs.definitionWithQuestions(Defs.textQuestion("id-imp1", "imp1"))));
        assertEquals(201, resp.getStatusCode().value());
        Map<String, Object> created = resp.getBody();

        assertEquals("Imported Fresh", created.get("name"), "no collision, no suffix");
        String publicId = (String) created.get("publicId");
        assertNotNull(publicId);
        assertTrue(publicId.startsWith("q_"), "a fresh publicId is generated");
        assertEquals(List.of(), created.get("allowedOrigins"), "origins start empty (P4-D3)");
        assertEquals(0, created.get("currentVersion"), "imported as an unpublished draft — never auto-published");
        assertEquals(true, created.get("hasUnpublishedChanges"));
        Map<String, Object> draft = (Map<String, Object>) created.get("draft");
        assertEquals("imp1", ((List<Map<String, Object>>) draft.get("questions")).get(0).get("code"));

        // Not published: the public live endpoint must 404.
        assertEquals(404, get("/public/v1/questionnaires/" + publicId + "/live").getStatusCode().value());
    }

    @Test
    void importSuffixesTheNameOnCollision() {
        createQuestionnaire("Taken Name");
        ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires/import",
                exportEnvelope("Taken Name", Defs.definitionWithQuestions(Defs.textQuestion("id-col1", "col1"))));
        assertEquals(201, resp.getStatusCode().value());
        assertEquals("Taken Name (imported)", resp.getBody().get("name"));
    }

    @Test
    void exportedFileRoundTripsThroughImport() {
        Map<String, Object> detail = createQuestionnaire("Round Trip");
        String id = (String) detail.get("id");
        String sourcePublicId = (String) detail.get("publicId");
        assertEquals(200, putDraft(id,
                Defs.definitionWithQuestions(Defs.textQuestion("id-rt1", "rt1"))).getStatusCode().value());

        Map<String, Object> exported = get("/api/v1/questionnaires/" + id + "/export").getBody();
        ResponseEntity<Map<String, Object>> imported = post("/api/v1/questionnaires/import", exported);
        assertEquals(201, imported.getStatusCode().value());
        assertEquals("Round Trip (imported)", imported.getBody().get("name"));
        assertNotEquals(sourcePublicId, imported.getBody().get("publicId"),
                "import must mint a new publicId, never reuse the exported questionnaire's");
        assertNotEquals(id, imported.getBody().get("id"));
    }

    @Test
    void importRejectsUnknownEnvelopeVersion() {
        long before = questionnaireCount();
        Map<String, Object> body = exportEnvelope("Bad Envelope",
                Defs.definitionWithQuestions(Defs.textQuestion("id-env1", "env1")));
        body.put("formsEngineExport", 2);

        ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires/import", body);
        assertEquals(400, resp.getStatusCode().value());
        String message = (String) resp.getBody().get("message");
        assertTrue(message.contains("formsEngineExport 2"), "must name the file's version, got: " + message);
        assertTrue(message.contains("supports formsEngineExport 1"), "must name the backend's version, got: " + message);
        assertEquals(before, questionnaireCount(), "a rejected import must create nothing");
    }

    @Test
    void importRejectsUnknownSchemaVersion() {
        long before = questionnaireCount();
        Map<String, Object> definition = Defs.definitionWithQuestions(Defs.textQuestion("id-sch1", "sch1"));
        definition.put("schemaVersion", 9);

        ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires/import",
                exportEnvelope("Bad Schema", definition));
        assertEquals(400, resp.getStatusCode().value());
        String message = (String) resp.getBody().get("message");
        assertTrue(message.contains("schemaVersion 9"), "must name the file's schemaVersion, got: " + message);
        assertTrue(message.contains("schemaVersion 1 and 2"), "must name the supported versions, got: " + message);
        assertEquals(before, questionnaireCount(), "a rejected import must create nothing");
    }

    @Test
    void importRunsFullPublishGradeValidation() {
        long before = questionnaireCount();
        // A dangling rule reference is tolerated by lenient draft validation
        // but blocks publish — import must apply the strict level (FR4-12).
        Map<String, Object> question = Defs.textQuestion("id-val1", "val1");
        question.put("visibility", Defs.conditionalOn("no_such_question", "EQUALS", "x"));

        ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires/import",
                exportEnvelope("Invalid Definition", Defs.definitionWithQuestions(question)));
        assertEquals(400, resp.getStatusCode().value());
        assertEquals("import validation failed", resp.getBody().get("message"));
        assertTrue(anyErrorContains(resp.getBody(), "unknown question code 'no_such_question'"),
                "the standard blocking-error list must carry the strict-validation problem");
        assertEquals(before, questionnaireCount(), "a rejected import must create nothing");
    }

    @Test
    void importRejectsAnEmptyDefinition() {
        // Publish-grade validation includes the non-empty rule.
        ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires/import",
                exportEnvelope("Empty Import", Defs.emptyDefinition()));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "questionnaire has no questions"));
    }

    @Test
    void importRejectsMissingDefinitionAndMissingName() {
        Map<String, Object> noDefinition = exportEnvelope("No Definition", null);
        noDefinition.remove("definition");
        ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires/import", noDefinition);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(((String) resp.getBody().get("message")).contains("definition"));

        Map<String, Object> noName = exportEnvelope("x",
                Defs.definitionWithQuestions(Defs.textQuestion("id-nn1", "nn1")));
        noName.remove("name");
        ResponseEntity<Map<String, Object>> resp2 = post("/api/v1/questionnaires/import", noName);
        assertEquals(400, resp2.getStatusCode().value());
        assertTrue(((String) resp2.getBody().get("message")).contains("name"));
    }
}
