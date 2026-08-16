package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FR3-25: uploads get their own, stricter per-IP bucket. A burst of upload
 * POSTs hits 429 with a Retry-After header, and consumes nothing from the
 * general public-mutating bucket (each request routes to exactly one bucket).
 * Runs in its own context with tiny, non-refilling-ish buckets.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "forms.rate-limit.enabled=true",
        "forms.rate-limit.capacity=2",
        "forms.rate-limit.refill-per-second=0",
        "forms.rate-limit.upload-capacity=2",
        "forms.rate-limit.upload-refill-per-second=0.05"
})
class UploadRateLimitTest extends FileTestSupport {

    @Test
    void uploadBucketIsSeparateAndAdvertisesRetryAfter() {
        // The filter sits in front of the handlers, so even uploads to a
        // nonexistent response consume upload tokens: 2 × 404, then 429s.
        ResponseEntity<Map<String, Object>> last = null;
        int tooMany = 0;
        for (int i = 0; i < 4; i++) {
            last = upload("r_missing", "resume", "a.pdf", TestFiles.pdf());
            if (last.getStatusCode().value() == 429) {
                tooMany++;
            }
        }
        assertTrue(tooMany >= 1, "a burst of 4 uploads against capacity 2 must produce 429s");
        assertEquals(429, last.getStatusCode().value());
        assertEquals(429, last.getBody().get("status"), "429 body must use the standard error shape");
        String retryAfter = last.getHeaders().getFirst("Retry-After");
        assertNotNull(retryAfter, "upload 429s must carry Retry-After (FR3-25)");
        long seconds = Long.parseLong(retryAfter);
        assertTrue(seconds >= 1 && seconds <= 20,
                "at 0.05 tokens/s the next token is at most 20 s away, got " + seconds);

        // The general mutating bucket (capacity 2) must be untouched by the 4
        // uploads: two general POSTs still pass the filter (404 downstream),
        // and only the third one is rate limited.
        for (int i = 0; i < 2; i++) {
            assertEquals(404, post("/public/v1/questionnaires/q_nonexistent/responses",
                    Map.of("versionNumber", 1)).getStatusCode().value(),
                    "uploads must not consume the general mutating bucket");
        }
        assertEquals(429, post("/public/v1/questionnaires/q_nonexistent/responses",
                Map.of("versionNumber", 1)).getStatusCode().value());
    }
}
