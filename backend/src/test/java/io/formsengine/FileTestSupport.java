package io.formsengine;

import io.formsengine.repository.UploadedFileRepository;
import io.formsengine.storage.FileStorage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Shared plumbing for the Phase-3 upload tests: multipart upload helper
 * (TestRestTemplate + ByteArrayResource with an overridden filename),
 * questionnaire/response setup and direct access to the file index and the
 * storage backend for assertions.
 */
public abstract class FileTestSupport extends BaseApiTest {

    @Autowired
    protected UploadedFileRepository uploadedFiles;

    @Autowired
    protected FileStorage storage;

    /** One published questionnaire's ids. */
    protected record Ctx(String id, String publicId) {
    }

    /** Saves + publishes a definition with the given questions; returns the ids. */
    @SafeVarargs
    protected final Ctx publishQuestionnaire(String name, Map<String, Object>... questions) {
        Map<String, Object> detail = createQuestionnaire(name);
        String id = (String) detail.get("id");
        String publicId = (String) detail.get("publicId");
        assertEquals(200, putDraft(id, Defs.definitionWithQuestions(questions)).getStatusCode().value(),
                "draft save should succeed");
        assertEquals(200, publish(id, null).getStatusCode().value(), "publish should succeed");
        return new Ctx(id, publicId);
    }

    /** Creates a response pinned to version 1. */
    protected String newResponse(String publicId) {
        ResponseEntity<Map<String, Object>> created = post(
                "/public/v1/questionnaires/" + publicId + "/responses", Map.of("versionNumber", 1));
        assertEquals(201, created.getStatusCode().value(), "response creation should succeed");
        return (String) created.getBody().get("responseId");
    }

    /** Multipart upload: parts {@code file} + {@code questionCode} (§6). */
    @SuppressWarnings({"unchecked", "rawtypes"})
    protected ResponseEntity<Map<String, Object>> upload(String responseId, String questionCode,
                                                         String fileName, byte[] content) {
        LinkedMultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("file", new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return fileName;
            }
        });
        parts.add("questionCode", questionCode);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        ResponseEntity<Map> raw = rest.exchange("/public/v1/responses/" + responseId + "/files",
                HttpMethod.POST, new HttpEntity<>(parts, headers), Map.class);
        return (ResponseEntity<Map<String, Object>>) (ResponseEntity) raw;
    }

    protected ResponseEntity<Map<String, Object>> deleteFile(String responseId, String fileId) {
        return exchange(HttpMethod.DELETE, "/public/v1/responses/" + responseId + "/files/" + fileId, null, null);
    }

    /** Management download as raw bytes (FR3-23). */
    protected ResponseEntity<byte[]> download(String questionnaireId, String responseId, String fileId) {
        return rest.exchange("/api/v1/questionnaires/" + questionnaireId + "/responses/" + responseId
                + "/files/" + fileId, HttpMethod.GET, null, byte[].class);
    }
}
