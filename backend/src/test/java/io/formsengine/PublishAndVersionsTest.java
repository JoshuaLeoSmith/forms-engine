package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Publish workflow and version history (FR-E-16, FR-E-18, FR-B-1).
 */
class PublishAndVersionsTest extends BaseApiTest {

    @Test
    void publishHappyPathCreatesVersionAndFlipsUnpublishedFlag() {
        String id = (String) createQuestionnaire("Publisher").get("id");
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("q1", "pub1"))).getStatusCode().value());

        ResponseEntity<Map<String, Object>> published = publish(id, "first release");
        assertEquals(200, published.getStatusCode().value());
        assertEquals(1, published.getBody().get("currentVersion"));
        assertEquals(Boolean.FALSE, published.getBody().get("hasUnpublishedChanges"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> versions = rest.getForObject("/api/v1/questionnaires/" + id + "/versions", List.class);
        assertEquals(1, versions.size());
        assertEquals(1, versions.get(0).get("versionNumber"));
        assertEquals("first release", versions.get(0).get("note"));
        assertNotNull(versions.get(0).get("publishedAt"));
    }

    @Test
    void publishRejectsEmptyQuestionnaire() {
        String id = (String) createQuestionnaire("Empty").get("id");
        ResponseEntity<Map<String, Object>> resp = publish(id, null);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "no questions"));
    }

    @Test
    void publishRejectsRadioWithZeroOptions() {
        String id = (String) createQuestionnaire("Radio Empty").get("id");
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.radioQuestion("q1", "radio1"))).getStatusCode().value());
        ResponseEntity<Map<String, Object>> resp = publish(id, null);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "option"));
    }

    @Test
    void publishRejectsDanglingRuleReference() {
        String id = (String) createQuestionnaire("Dangling").get("id");
        Map<String, Object> q = Defs.textQuestion("q1", "target1");
        q.put("visibility", Defs.conditionalOn("ghost", "EQUALS", "boo"));
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(q)).getStatusCode().value());
        ResponseEntity<Map<String, Object>> resp = publish(id, null);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "ghost"));
    }

    @Test
    void publishRejectsSelfReference() {
        String id = (String) createQuestionnaire("Selfref").get("id");
        Map<String, Object> q = Defs.textQuestion("q1", "myself");
        q.put("visibility", Defs.conditionalOn("myself", "EQUALS", "x"));
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(q)).getStatusCode().value());
        ResponseEntity<Map<String, Object>> resp = publish(id, null);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "own code"));
    }

    @Test
    void publishRejectsUnsupportedOperator() {
        String id = (String) createQuestionnaire("Operator").get("id");
        Map<String, Object> target = Defs.textQuestion("q1", "opTarget");
        Map<String, Object> dependent = Defs.textQuestion("q2", "opDependent");
        dependent.put("visibility", Defs.conditionalOn("opTarget", "GREATER_THAN", "5"));
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(target, dependent)).getStatusCode().value());
        ResponseEntity<Map<String, Object>> resp = publish(id, null);
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "GREATER_THAN"));
    }

    @Test
    void versionsListGetRestoreAndRepublish() {
        String id = (String) createQuestionnaire("History").get("id");

        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("q1", "era1"))).getStatusCode().value());
        assertEquals(200, publish(id, "v1 note").getStatusCode().value());

        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("q1", "era2"))).getStatusCode().value());
        assertEquals(200, publish(id, "v2 note").getStatusCode().value());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> versions = rest.getForObject("/api/v1/questionnaires/" + id + "/versions", List.class);
        assertEquals(2, versions.size());
        assertEquals(2, versions.get(0).get("versionNumber"));
        assertEquals(1, versions.get(1).get("versionNumber"));

        ResponseEntity<Map<String, Object>> v1 = get("/api/v1/questionnaires/" + id + "/versions/1");
        assertEquals(200, v1.getStatusCode().value());
        assertEquals("v1 note", v1.getBody().get("note"));
        @SuppressWarnings("unchecked")
        Map<String, Object> v1def = (Map<String, Object>) v1.getBody().get("definition");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> v1questions = (List<Map<String, Object>>) v1def.get("questions");
        assertEquals("era1", v1questions.get(0).get("code"));

        assertEquals(404, get("/api/v1/questionnaires/" + id + "/versions/9").getStatusCode().value());

        // Restore v1 into the draft: draft content flips back, flag goes up.
        ResponseEntity<Map<String, Object>> restored = post("/api/v1/questionnaires/" + id + "/versions/1/restore", Map.of());
        assertEquals(200, restored.getStatusCode().value());
        assertEquals(Boolean.TRUE, restored.getBody().get("hasUnpublishedChanges"));
        @SuppressWarnings("unchecked")
        Map<String, Object> restoredDraft = (Map<String, Object>) restored.getBody().get("draft");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> restoredQuestions = (List<Map<String, Object>>) restoredDraft.get("questions");
        assertEquals("era1", restoredQuestions.get(0).get("code"));

        // Publishing the restored draft appends v3 — history is never rewritten.
        ResponseEntity<Map<String, Object>> v3 = publish(id, "restored v1");
        assertEquals(200, v3.getStatusCode().value());
        assertEquals(3, v3.getBody().get("currentVersion"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> afterRestore = rest.getForObject("/api/v1/questionnaires/" + id + "/versions", List.class);
        assertEquals(3, afterRestore.size());
        assertEquals(3, afterRestore.get(0).get("versionNumber"));
    }
}
