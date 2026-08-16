package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * NFR-3 rate limiting: per-IP token bucket on mutating public endpoints, plus
 * the stricter dedicated geocode bucket (FR2-13). Runs in its own context with
 * tiny buckets (no refill) so a short burst deterministically hits 429.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "forms.rate-limit.enabled=true",
        "forms.rate-limit.capacity=3",
        "forms.rate-limit.refill-per-second=0",
        "forms.rate-limit.geocode-capacity=2",
        "forms.rate-limit.geocode-refill-per-second=0",
        "forms.rate-limit.ref-status-capacity=2",
        "forms.rate-limit.ref-status-refill-per-second=0"
})
class RateLimitTest extends BaseApiTest {

    @Test
    void burstOfMutatingPublicRequestsHits429() {
        int tooMany = 0;
        ResponseEntity<Map<String, Object>> last = null;
        for (int i = 0; i < 10; i++) {
            last = post("/public/v1/questionnaires/q_nonexistent/responses", Map.of("versionNumber", 1));
            if (last.getStatusCode().value() == 429) {
                tooMany++;
            }
        }
        assertTrue(tooMany >= 1, "a burst of 10 mutating requests against capacity 3 must produce 429s");
        assertEquals(429, last.getStatusCode().value(), "the final request of the burst should be rate limited");
        assertEquals(429, last.getBody().get("status"));
        assertTrue(last.getBody().containsKey("errors"), "429 body must use the standard error shape");
    }

    @Test
    void nonMutatingPublicRequestsAreNotRateLimited() {
        for (int i = 0; i < 10; i++) {
            ResponseEntity<Map<String, Object>> resp = get("/public/v1/questionnaires/q_nonexistent/live");
            assertNotEquals(429, resp.getStatusCode().value(), "GET requests must not be rate limited");
            assertEquals(404, resp.getStatusCode().value());
        }
    }

    @Test
    void rehydrationGetIsNotRateLimited() {
        // FR4-2: the public rehydration GET is read-only and must never
        // consume the mutating bucket — refresh storms are its whole purpose.
        for (int i = 0; i < 10; i++) {
            ResponseEntity<Map<String, Object>> resp = get("/public/v1/responses/r_nonexistent");
            assertNotEquals(429, resp.getStatusCode().value(), "rehydration GETs must not be rate limited");
            assertEquals(404, resp.getStatusCode().value());
        }
    }

    @Test
    void geocodeGetsItsOwnStricterBucket() {
        // The geocode upstream is a dead port in tests (forms.photon.base-url),
        // so successful requests return 200 [] instantly; the bucket (capacity
        // 2, no refill) turns the rest of the burst into 429s.
        int tooMany = 0;
        int last = 0;
        for (int i = 0; i < 6; i++) {
            last = rest.getForEntity("/public/v1/geocode?q=Main", String.class).getStatusCode().value();
            if (last == 429) {
                tooMany++;
            }
        }
        assertTrue(tooMany >= 1, "a burst of 6 geocode requests against capacity 2 must produce 429s");
        assertEquals(429, last, "the final geocode request of the burst should be rate limited");
    }

    @Test
    void refStatusGetsItsOwnStricterBucket() {
        // FR5-10: the completion boolean per ref is enumeration bait, so the
        // endpoint sits in its own stricter bucket (capacity 2, no refill here).
        int tooMany = 0;
        int last = 0;
        for (int i = 0; i < 6; i++) {
            last = rest.getForEntity("/public/v1/questionnaires/q_nonexistent/ref-status?ref=user-1", String.class)
                    .getStatusCode().value();
            if (last == 429) {
                tooMany++;
            }
        }
        assertTrue(tooMany >= 1, "a burst of 6 ref-status requests against capacity 2 must produce 429s");
        assertEquals(429, last, "the final ref-status request of the burst should be rate limited");
    }

    @Test
    void managementApiIsNotRateLimited() {
        for (int i = 0; i < 10; i++) {
            ResponseEntity<Map<String, Object>> resp = post("/api/v1/questionnaires", Map.of("name", "RL " + i));
            assertEquals(201, resp.getStatusCode().value(), "management POSTs must not be rate limited");
        }
    }
}
