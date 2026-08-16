package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FR3-19 outermost layer: the servlet multipart limits are derived from the
 * system cap ({@code forms.uploads.max-file-size-mb}), so a body over the cap
 * dies at the framework boundary — before any handler code — as a clean 413 in
 * the standard error shape. Runs with a 2 MB system cap so the oversized body
 * stays cheap.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "forms.uploads.max-file-size-mb=2"
})
class FrameworkUploadLimitTest extends FileTestSupport {

    @Test
    void bodyOverTheSystemCapIs413() {
        Ctx ctx = publishQuestionnaire("Framework Cap",
                Defs.fileUploadQuestion("q1", "resume", List.of("DOCUMENTS"), 1, 2));
        String responseId = newResponse(ctx.publicId());

        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "resume", "huge.pdf",
                TestFiles.pdf(3 * 1024 * 1024));
        assertEquals(413, rejected.getStatusCode().value());
        assertEquals(413, rejected.getBody().get("status"), "413 must use the standard error shape");
        assertTrue(rejected.getBody().containsKey("errors"));

        // Nothing may have been indexed or stored.
        assertTrue(uploadedFiles.findByResponseIdAndStatus(responseId, "ACTIVE").isEmpty());

        // A file within the cap still works in the same context.
        assertEquals(201, upload(responseId, "resume", "ok.pdf", TestFiles.pdf(64 * 1024))
                .getStatusCode().value());
    }
}
