package io.formsengine;

import io.formsengine.domain.UploadedFileDocument;
import io.formsengine.service.FileService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The §7 rejection gauntlet (NFR3-2 is the spec): oversize vs the question
 * cap, disallowed category, extension/content mismatches (zip renamed .pdf,
 * PNG renamed .pdf), HTML masquerading as .txt, path-traversal filenames,
 * per-response count and byte caps, per-question maxFiles, empty files and
 * extensionless files. Every rejection leaves no storage write and no ACTIVE
 * row. Runs in its own context with shrunken per-response caps
 * (3 files / 1 MB) so cap breaches are cheap to provoke.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "forms.uploads.max-files-per-response=3",
        "forms.uploads.max-bytes-per-response-mb=1"
})
class FileRejectionTest extends FileTestSupport {

    /** doc: DOCUMENTS only, maxFiles 1, 1 MB; note: TEXT; any: everything, maxFiles 10, 1 MB. */
    private Ctx publishRejectionQuestionnaire(String name) {
        return publishQuestionnaire(name,
                Defs.fileUploadQuestion("q1", "doc", List.of("DOCUMENTS"), 1, 1),
                Defs.fileUploadQuestion("q2", "note", List.of("TEXT"), 2, 1),
                Defs.fileUploadQuestion("q3", "any",
                        List.of("DOCUMENTS", "IMAGES", "SPREADSHEETS", "TEXT", "ARCHIVES"), 10, 1));
    }

    private void assertRejected(ResponseEntity<Map<String, Object>> response, int status, String messageFragment) {
        assertEquals(status, response.getStatusCode().value());
        assertEquals(status, response.getBody().get("status"), "error body must use the standard shape");
        String message = (String) response.getBody().get("message");
        assertTrue(message.contains(messageFragment),
                "expected message containing '" + messageFragment + "', got: " + message);
    }

    private void assertNoActiveFiles(String responseId) {
        assertTrue(uploadedFiles.findByResponseIdAndStatus(responseId, UploadedFileDocument.STATUS_ACTIVE).isEmpty(),
                "a rejected upload must not leave an ACTIVE file row");
    }

    @Test
    void oversizeAgainstTheQuestionCapIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Oversize");
        String responseId = newResponse(ctx.publicId());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "doc", "big.pdf",
                TestFiles.pdf((int) (1.5 * 1024 * 1024)));
        assertRejected(rejected, 400, "allows at most 1 MB");
        assertNoActiveFiles(responseId);
    }

    @Test
    void disallowedCategoryExtensionIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Exe");
        String responseId = newResponse(ctx.publicId());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "any", "setup.exe",
                TestFiles.text("MZ this is not really an executable"));
        assertRejected(rejected, 400, "not allowed");
        assertNoActiveFiles(responseId);
    }

    @Test
    void zipRenamedToPdfIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Zip Pdf");
        String responseId = newResponse(ctx.publicId());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "doc", "report.pdf",
                TestFiles.zip("innocent.txt"));
        assertRejected(rejected, 400, "extension and content must match");
        assertNoActiveFiles(responseId);
    }

    @Test
    void htmlMasqueradingAsTxtIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Html Txt");
        String responseId = newResponse(ctx.publicId());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "note", "notes.txt",
                TestFiles.text("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>"));
        assertRejected(rejected, 400, "HTML");
        assertNoActiveFiles(responseId);
    }

    @Test
    void pngMasqueradingAsPdfIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Png Pdf");
        String responseId = newResponse(ctx.publicId());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "doc", "scan.pdf", TestFiles.png());
        assertRejected(rejected, 400, "extension and content must match");
        assertNoActiveFiles(responseId);
    }

    @Test
    void pathTraversalFilenameIsSanitizedAndAccepted() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Traversal");
        String responseId = newResponse(ctx.publicId());
        ResponseEntity<Map<String, Object>> uploaded = upload(responseId, "doc", "../../evil.pdf", TestFiles.pdf());
        assertEquals(201, uploaded.getStatusCode().value(), "the upload itself succeeds — only the name is cleaned");
        String storedName = (String) uploaded.getBody().get("fileName");
        assertEquals("evil.pdf", storedName);
        assertFalse(storedName.contains("/") || storedName.contains("\\"),
                "stored fileName must contain no path separators");
        String fileId = (String) uploaded.getBody().get("fileId");
        assertEquals("evil.pdf", uploadedFiles.findByFileId(fileId).orElseThrow().getFileName());
    }

    @Test
    void sanitizeFileNameStripsPathsControlsAndQuotes() {
        // FR3-24 unit checks, incl. the backslash form that multipart quoting
        // makes awkward to send end-to-end.
        assertEquals("evil.pdf", FileService.sanitizeFileName("..\\..\\evil.pdf"));
        assertEquals("evil.pdf", FileService.sanitizeFileName("../../evil.pdf"));
        assertEquals("evil.pdf", FileService.sanitizeFileName("C:\\Users\\joe\\evil.pdf"));
        assertEquals("report.pdf", FileService.sanitizeFileName("re\u0000port\u001F.pdf"));
        assertEquals("quoted.pdf", FileService.sanitizeFileName("\"quo`ted\".pdf"));
        assertEquals("upload.pdf", FileService.fallbackIfEmptyBaseName(FileService.sanitizeFileName("\".pdf"), "pdf"));
        String longName = "a".repeat(300) + ".pdf";
        String capped = FileService.sanitizeFileName(longName);
        assertEquals(255, capped.length(), "names cap at 255 chars");
        assertTrue(capped.endsWith(".pdf"), "the extension must survive the cap");
    }

    @Test
    void perResponseFileCountCapIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Count Cap");
        String responseId = newResponse(ctx.publicId());
        for (int i = 1; i <= 3; i++) {
            assertEquals(201, upload(responseId, "any", "f" + i + ".pdf", TestFiles.pdf()).getStatusCode().value());
        }
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "any", "f4.pdf", TestFiles.pdf());
        assertRejected(rejected, 400, "per-response maximum is 3");
    }

    @Test
    void perResponseByteCapIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Byte Cap");
        String responseId = newResponse(ctx.publicId());
        byte[] big = TestFiles.pdf(700 * 1024);
        assertEquals(201, upload(responseId, "any", "one.pdf", big).getStatusCode().value());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "any", "two.pdf", big);
        assertRejected(rejected, 400, "per-response maximum is 1 MB");
    }

    @Test
    void perQuestionMaxFilesIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Question Cap");
        String responseId = newResponse(ctx.publicId());
        assertEquals(201, upload(responseId, "doc", "one.pdf", TestFiles.pdf()).getStatusCode().value());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "doc", "two.pdf", TestFiles.pdf());
        assertRejected(rejected, 400, "its maximum is 1");
    }

    @Test
    void emptyFileIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject Empty");
        String responseId = newResponse(ctx.publicId());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "doc", "empty.pdf", new byte[0]);
        assertRejected(rejected, 400, "empty");
        assertNoActiveFiles(responseId);
    }

    @Test
    void extensionlessFileIs400() {
        Ctx ctx = publishRejectionQuestionnaire("Reject No Extension");
        String responseId = newResponse(ctx.publicId());
        ResponseEntity<Map<String, Object>> rejected = upload(responseId, "note", "README",
                TestFiles.text("just some text"));
        assertRejected(rejected, 400, "no extension");
        assertNoActiveFiles(responseId);
    }
}
