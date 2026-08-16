package io.formsengine;

import io.formsengine.domain.UploadedFileDocument;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Upload/delete/download happy paths and state rejections (Phase 3 §6, FR3-7,
 * FR3-9, FR3-10, FR3-13, FR3-15, FR3-23): reference object shape, Mongo row +
 * storage object existence, answers-array acceptance, management download
 * headers and byte equality, tombstoning with idempotent re-delete, completed
 * responses rejecting mutations, cross-response probing as 404, and the
 * stats/config management endpoints.
 */
class FileUploadApiTest extends FileTestSupport {

    private Ctx publishWithUploadQuestion(String name) {
        return publishQuestionnaire(name,
                Defs.fileUploadQuestion("q1", "resume", List.of("DOCUMENTS"), 2, 10),
                Defs.textQuestion("q2", "fullName"));
    }

    @Test
    void happyPathUploadPatchDownloadDelete() {
        Ctx ctx = publishWithUploadQuestion("Files Happy");
        String responseId = newResponse(ctx.publicId());
        byte[] pdf = TestFiles.pdf();

        // Upload → 201 with the §4.2 reference object, nothing else.
        ResponseEntity<Map<String, Object>> uploaded = upload(responseId, "resume", "My Resume.pdf", pdf);
        assertEquals(201, uploaded.getStatusCode().value());
        Map<String, Object> ref = uploaded.getBody();
        String fileId = (String) ref.get("fileId");
        assertNotNull(fileId);
        assertTrue(fileId.startsWith("f_"));
        assertEquals(34, fileId.length(), "f_ + 32 hex chars of a dashless UUID");
        assertEquals("My Resume.pdf", ref.get("fileName"));
        assertEquals(pdf.length, ((Number) ref.get("size")).intValue());
        assertEquals("application/pdf", ref.get("contentType"), "the verified type, not the client's claim");
        assertFalse(ref.containsKey("storageKey"), "storage keys never appear in any API response (FR3-23)");

        // Mongo row + storage object (FR3-7 key shape).
        UploadedFileDocument doc = uploadedFiles.findByFileId(fileId).orElseThrow();
        assertEquals(UploadedFileDocument.STATUS_ACTIVE, doc.getStatus());
        assertEquals("resume", doc.getQuestionCode());
        assertEquals(ctx.id() + "/" + responseId + "/" + fileId, doc.getStorageKey());
        assertNotNull(doc.getCreatedAt());
        assertTrue(storage.exists(doc.getStorageKey()), "the object must exist in storage");

        // FR3-9: a file-reference array is a legal answer value.
        ResponseEntity<Map<String, Object>> patched = patch("/public/v1/responses/" + responseId, Map.of(
                "answers", Map.of("resume", List.of(Map.of(
                        "fileId", fileId, "fileName", "My Resume.pdf",
                        "size", pdf.length, "contentType", "application/pdf")))));
        assertEquals(200, patched.getStatusCode().value());

        // Management download (FR3-23): attachment + nosniff + verified type + exact bytes.
        ResponseEntity<byte[]> downloaded = download(ctx.id(), responseId, fileId);
        assertEquals(200, downloaded.getStatusCode().value());
        String disposition = downloaded.getHeaders().getFirst("Content-Disposition");
        assertNotNull(disposition);
        assertTrue(disposition.startsWith("attachment"), "downloads are always attachments, got: " + disposition);
        assertTrue(disposition.contains("Resume"), "the sanitized filename must appear, got: " + disposition);
        assertEquals("nosniff", downloaded.getHeaders().getFirst("X-Content-Type-Options"));
        assertEquals("application/pdf", downloaded.getHeaders().getContentType().toString());
        assertEquals(pdf.length, downloaded.getHeaders().getContentLength());
        assertArrayEquals(pdf, downloaded.getBody(), "downloaded bytes must equal the uploaded bytes");

        // Delete (FR3-10): storage object gone, tombstone written, idempotent.
        assertEquals(204, deleteFile(responseId, fileId).getStatusCode().value());
        UploadedFileDocument tombstone = uploadedFiles.findByFileId(fileId).orElseThrow();
        assertEquals(UploadedFileDocument.STATUS_DELETED, tombstone.getStatus());
        assertNotNull(tombstone.getDeletedAt());
        assertFalse(storage.exists(tombstone.getStorageKey()), "the storage object must be deleted first");
        assertEquals(204, deleteFile(responseId, fileId).getStatusCode().value(), "re-delete must be a 204 no-op");

        // Deleted files are 404 on the management download.
        assertEquals(404, download(ctx.id(), responseId, fileId).getStatusCode().value());
    }

    @Test
    void completedResponseRejectsUploadAndDelete() {
        Ctx ctx = publishWithUploadQuestion("Files Completed");
        String responseId = newResponse(ctx.publicId());
        String fileId = (String) upload(responseId, "resume", "keep.pdf", TestFiles.pdf()).getBody().get("fileId");

        assertEquals(200, post("/public/v1/responses/" + responseId + "/complete", Map.of()).getStatusCode().value());

        ResponseEntity<Map<String, Object>> lateUpload = upload(responseId, "resume", "late.pdf", TestFiles.pdf());
        assertEquals(409, lateUpload.getStatusCode().value());
        assertEquals(409, lateUpload.getBody().get("status"), "409 body must use the standard error shape");

        ResponseEntity<Map<String, Object>> lateDelete = deleteFile(responseId, fileId);
        assertEquals(409, lateDelete.getStatusCode().value());
        assertEquals(UploadedFileDocument.STATUS_ACTIVE,
                uploadedFiles.findByFileId(fileId).orElseThrow().getStatus(),
                "a completed response's files must stay ACTIVE");
    }

    @Test
    void crossResponseFileIdAccessIs404() {
        Ctx ctx = publishWithUploadQuestion("Files Cross");
        String responseA = newResponse(ctx.publicId());
        String responseB = newResponse(ctx.publicId());
        String fileId = (String) upload(responseA, "resume", "a.pdf", TestFiles.pdf()).getBody().get("fileId");

        // Deleting another response's file is indistinguishable from a missing file.
        assertEquals(404, deleteFile(responseB, fileId).getStatusCode().value());
        assertEquals(UploadedFileDocument.STATUS_ACTIVE,
                uploadedFiles.findByFileId(fileId).orElseThrow().getStatus());

        // Management download with the wrong response (or questionnaire) is 404 too.
        assertEquals(404, download(ctx.id(), responseB, fileId).getStatusCode().value());
        Ctx other = publishWithUploadQuestion("Files Cross Other");
        assertEquals(404, download(other.id(), responseA, fileId).getStatusCode().value());
    }

    @Test
    void unknownResponseQuestionCodeAndTypeAre404And400() {
        Ctx ctx = publishWithUploadQuestion("Files Bad Target");
        String responseId = newResponse(ctx.publicId());

        assertEquals(404, upload("r_doesnotexist", "resume", "a.pdf", TestFiles.pdf()).getStatusCode().value());

        ResponseEntity<Map<String, Object>> unknownCode = upload(responseId, "nope", "a.pdf", TestFiles.pdf());
        assertEquals(400, unknownCode.getStatusCode().value());
        assertTrue(((String) unknownCode.getBody().get("message")).contains("does not exist"));

        ResponseEntity<Map<String, Object>> wrongType = upload(responseId, "fullName", "a.pdf", TestFiles.pdf());
        assertEquals(400, wrongType.getStatusCode().value());
        assertTrue(((String) wrongType.getBody().get("message")).contains("only FILE_UPLOAD questions"));

        assertTrue(uploadedFiles.findByResponseIdAndStatus(responseId, UploadedFileDocument.STATUS_ACTIVE).isEmpty(),
                "no rejected upload may leave a file row behind");
    }

    @Test
    void statsCountsActiveFilesOnly() {
        Ctx ctx = publishWithUploadQuestion("Files Stats");
        String responseId = newResponse(ctx.publicId());
        byte[] first = TestFiles.pdf(2000);
        byte[] second = TestFiles.pdf(3000);
        String firstId = (String) upload(responseId, "resume", "one.pdf", first).getBody().get("fileId");
        upload(responseId, "resume", "two.pdf", second);

        ResponseEntity<Map<String, Object>> stats = get("/api/v1/questionnaires/" + ctx.id() + "/files/stats");
        assertEquals(200, stats.getStatusCode().value());
        assertEquals(2, ((Number) stats.getBody().get("fileCount")).intValue());
        assertEquals(first.length + second.length, ((Number) stats.getBody().get("totalBytes")).longValue());

        assertEquals(204, deleteFile(responseId, firstId).getStatusCode().value());
        Map<String, Object> after = get("/api/v1/questionnaires/" + ctx.id() + "/files/stats").getBody();
        assertEquals(1, ((Number) after.get("fileCount")).intValue());
        assertEquals(second.length, ((Number) after.get("totalBytes")).longValue());
    }

    @Test
    void uploadsConfigExposesTheSystemCaps() {
        ResponseEntity<Map<String, Object>> config = get("/api/v1/uploads/config");
        assertEquals(200, config.getStatusCode().value());
        assertEquals(50, ((Number) config.getBody().get("maxFileSizeMb")).intValue());
        assertEquals(20, ((Number) config.getBody().get("maxFilesPerResponse")).intValue());
        assertEquals(200L * 1024 * 1024, ((Number) config.getBody().get("maxBytesPerResponse")).longValue());
    }

    @Test
    void missingMultipartPartsAre400() {
        Ctx ctx = publishWithUploadQuestion("Files Missing Parts");
        String responseId = newResponse(ctx.publicId());

        // No questionCode part.
        org.springframework.util.LinkedMultiValueMap<String, Object> parts = new org.springframework.util.LinkedMultiValueMap<>();
        parts.add("file", new org.springframework.core.io.ByteArrayResource(TestFiles.pdf()) {
            @Override
            public String getFilename() {
                return "a.pdf";
            }
        });
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);
        @SuppressWarnings({"unchecked", "rawtypes"})
        ResponseEntity<Map<String, Object>> noCode = (ResponseEntity<Map<String, Object>>) (ResponseEntity)
                rest.exchange("/public/v1/responses/" + responseId + "/files",
                        org.springframework.http.HttpMethod.POST,
                        new org.springframework.http.HttpEntity<>(parts, headers), Map.class);
        assertEquals(400, noCode.getStatusCode().value());
        assertEquals(400, noCode.getBody().get("status"), "400 body must use the standard error shape");
        assertTrue(noCode.getBody().containsKey("errors"));

        // No file part.
        org.springframework.util.LinkedMultiValueMap<String, Object> onlyCode = new org.springframework.util.LinkedMultiValueMap<>();
        onlyCode.add("questionCode", "resume");
        @SuppressWarnings({"unchecked", "rawtypes"})
        ResponseEntity<Map<String, Object>> noFile = (ResponseEntity<Map<String, Object>>) (ResponseEntity)
                rest.exchange("/public/v1/responses/" + responseId + "/files",
                        org.springframework.http.HttpMethod.POST,
                        new org.springframework.http.HttpEntity<>(onlyCode, headers), Map.class);
        assertEquals(400, noFile.getStatusCode().value());
        assertEquals(400, noFile.getBody().get("status"));
    }
}
