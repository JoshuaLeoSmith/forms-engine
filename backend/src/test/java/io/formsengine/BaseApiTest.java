package io.formsengine;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Shared plumbing for full-stack integration tests (NFR-7): random port,
 * embedded Mongo via flapdoodle, TestRestTemplate.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class BaseApiTest {

    @Autowired
    protected TestRestTemplate rest;

    @SuppressWarnings({"unchecked", "rawtypes"})
    protected ResponseEntity<Map<String, Object>> exchange(HttpMethod method, String url, Object body, HttpHeaders headers) {
        HttpHeaders h = headers == null ? new HttpHeaders() : headers;
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> raw = rest.exchange(url, method, new HttpEntity<>(body, h), Map.class);
        return (ResponseEntity<Map<String, Object>>) (ResponseEntity) raw;
    }

    protected ResponseEntity<Map<String, Object>> post(String url, Object body) {
        return exchange(HttpMethod.POST, url, body, null);
    }

    protected ResponseEntity<Map<String, Object>> put(String url, Object body) {
        return exchange(HttpMethod.PUT, url, body, null);
    }

    protected ResponseEntity<Map<String, Object>> patch(String url, Object body) {
        return exchange(HttpMethod.PATCH, url, body, null);
    }

    protected ResponseEntity<Map<String, Object>> get(String url) {
        return exchange(HttpMethod.GET, url, null, null);
    }

    /** Creates a questionnaire and returns its detail body. */
    protected Map<String, Object> createQuestionnaire(String name) {
        ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires", Map.of("name", name));
        assertEquals(201, resp.getStatusCode().value(), "create questionnaire should return 201");
        return resp.getBody();
    }

    protected ResponseEntity<Map<String, Object>> putDraft(String id, Map<String, Object> definition) {
        return put("/api/v1/questionnaires/" + id + "/draft", definition);
    }

    protected ResponseEntity<Map<String, Object>> publish(String id, String note) {
        Object body = note == null ? Map.of() : Map.of("note", note);
        return post("/api/v1/questionnaires/" + id + "/publish", body);
    }

    /** Saves a valid single-question draft and publishes it; returns the publish detail body. */
    protected Map<String, Object> draftAndPublish(String id, String code) {
        ResponseEntity<Map<String, Object>> draft = putDraft(id, Defs.definitionWithQuestions(Defs.textQuestion("id-" + code, code)));
        assertEquals(200, draft.getStatusCode().value(), "draft save should succeed");
        ResponseEntity<Map<String, Object>> published = publish(id, null);
        assertEquals(200, published.getStatusCode().value(), "publish should succeed");
        return published.getBody();
    }

    @SuppressWarnings("unchecked")
    protected static List<String> errors(Map<String, Object> body) {
        return (List<String>) body.get("errors");
    }

    protected static boolean anyErrorContains(Map<String, Object> body, String fragment) {
        List<String> errs = errors(body);
        if (errs == null) {
            return false;
        }
        return errs.stream().anyMatch(e -> e.contains(fragment));
    }
}
