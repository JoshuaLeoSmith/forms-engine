package io.formsengine;

import io.formsengine.repository.ResponseRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Questionnaire CRUD: create, list, rename, allowedOrigins, duplicate, delete
 * (FR-E-1, FR-E-2, FR-B-3).
 */
class ManagementQuestionnaireTest extends BaseApiTest {

    @Autowired
    private ResponseRepository responseRepository;

    @Test
    void createReturnsDetailAndAppearsInList() {
        Map<String, Object> detail = createQuestionnaire("List Me");
        assertNotNull(detail.get("id"));
        String publicId = (String) detail.get("publicId");
        assertNotNull(publicId);
        assertTrue(publicId.startsWith("q_"), "publicId should start with q_");
        assertEquals(12, publicId.length(), "publicId should be q_ + 10 chars");
        assertEquals("List Me", detail.get("name"));
        assertEquals(0, detail.get("currentVersion"));
        assertEquals(Boolean.TRUE, detail.get("hasUnpublishedChanges"));
        assertNotNull(detail.get("updatedAt"));
        assertEquals(List.of(), detail.get("allowedOrigins"));
        @SuppressWarnings("unchecked")
        Map<String, Object> draft = (Map<String, Object>) detail.get("draft");
        assertEquals(1, draft.get("schemaVersion"));
        assertEquals(List.of(), draft.get("questions"));

        ResponseEntity<Map<String, Object>> listResp = get("/api/v1/questionnaires?page=0&size=50");
        assertEquals(200, listResp.getStatusCode().value());
        Map<String, Object> page = listResp.getBody();
        assertEquals(0, page.get("page"));
        assertNotNull(page.get("total"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) page.get("items");
        Map<String, Object> row = items.stream()
                .filter(i -> publicId.equals(i.get("publicId")))
                .findFirst().orElseThrow();
        assertEquals("List Me", row.get("name"));
        assertEquals(0, row.get("currentVersion"));
        assertEquals(Boolean.TRUE, row.get("hasUnpublishedChanges"));
        assertEquals(0, ((Number) row.get("responseCount")).longValue());
        assertNotNull(row.get("updatedAt"));
    }

    @Test
    void renameViaPatchKeepsPublicId() {
        Map<String, Object> detail = createQuestionnaire("Old Name");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");

        ResponseEntity<Map<String, Object>> patched = patch("/api/v1/questionnaires/" + id, Map.of("name", "New Name"));
        assertEquals(200, patched.getStatusCode().value());
        assertEquals("New Name", patched.getBody().get("name"));
        assertEquals(publicId, patched.getBody().get("publicId"));
    }

    @Test
    void allowedOriginsPatchValidatesSyntax() {
        String id = (String) createQuestionnaire("Origins").get("id");

        ResponseEntity<Map<String, Object>> ok = patch("/api/v1/questionnaires/" + id,
                Map.of("allowedOrigins", List.of("https://app.example.com", "http://localhost:4200")));
        assertEquals(200, ok.getStatusCode().value());
        assertEquals(List.of("https://app.example.com", "http://localhost:4200"), ok.getBody().get("allowedOrigins"));

        assertEquals(400, patch("/api/v1/questionnaires/" + id,
                Map.of("allowedOrigins", List.of("*"))).getStatusCode().value());
        assertEquals(400, patch("/api/v1/questionnaires/" + id,
                Map.of("allowedOrigins", List.of("https://app.example.com/path"))).getStatusCode().value());
        assertEquals(400, patch("/api/v1/questionnaires/" + id,
                Map.of("allowedOrigins", List.of("ftp://files.example.com"))).getStatusCode().value());
        assertEquals(400, patch("/api/v1/questionnaires/" + id,
                Map.of("allowedOrigins", List.of("not an origin"))).getStatusCode().value());
    }

    @Test
    void duplicateCopiesDraftButNotVersionsOrResponses() {
        Map<String, Object> original = createQuestionnaire("Original");
        String id = (String) original.get("id");
        draftAndPublish(id, "dupq1");

        ResponseEntity<Map<String, Object>> dup = post("/api/v1/questionnaires/" + id + "/duplicate", Map.of());
        assertEquals(201, dup.getStatusCode().value());
        Map<String, Object> copy = dup.getBody();
        assertEquals("Copy of Original", copy.get("name"));
        assertNotEquals(original.get("publicId"), copy.get("publicId"));
        assertEquals(0, copy.get("currentVersion"));
        assertEquals(Boolean.TRUE, copy.get("hasUnpublishedChanges"));
        @SuppressWarnings("unchecked")
        Map<String, Object> draft = (Map<String, Object>) copy.get("draft");
        assertEquals(1, ((List<?>) draft.get("questions")).size());

        String copyId = (String) copy.get("id");
        List<?> versionList = rest.getForObject("/api/v1/questionnaires/" + copyId + "/versions", List.class);
        assertNotNull(versionList);
        assertTrue(versionList.isEmpty(), "duplicate must not copy versions");
    }

    @Test
    void deleteRemovesQuestionnaireAndVersionsButRetainsResponses() {
        Map<String, Object> detail = createQuestionnaire("Doomed");
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        draftAndPublish(id, "delq1");

        ResponseEntity<Map<String, Object>> created = post(
                "/public/v1/questionnaires/" + publicId + "/responses", Map.of("versionNumber", 1));
        assertEquals(201, created.getStatusCode().value());
        String responseId = (String) created.getBody().get("responseId");

        ResponseEntity<Map<String, Object>> deleted = exchange(HttpMethod.DELETE, "/api/v1/questionnaires/" + id, null, null);
        assertEquals(204, deleted.getStatusCode().value());

        assertEquals(404, get("/api/v1/questionnaires/" + id).getStatusCode().value());
        assertEquals(404, get("/public/v1/questionnaires/" + publicId + "/live").getStatusCode().value());

        // FR-E-1: responses are retained (orphaned).
        assertTrue(responseRepository.findByResponseId(responseId).isPresent(),
                "responses must be retained after questionnaire deletion");
        assertFalse(responseId.isBlank());
    }

    @Test
    void getUnknownIdIs404() {
        assertEquals(404, get("/api/v1/questionnaires/ffffffffffffffffffffffff").getStatusCode().value());
        assertEquals(404, get("/api/v1/questionnaires/not-a-hex-id").getStatusCode().value());
    }
}
