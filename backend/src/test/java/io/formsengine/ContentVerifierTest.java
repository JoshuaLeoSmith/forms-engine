package io.formsengine;

import io.formsengine.service.ContentVerifier;
import io.formsengine.web.ApiException;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pure unit coverage of the magic-byte detector (FR3-21, P3-D2): every
 * signature branch, the OOXML-container disambiguation (docx/xlsx vs raw zip,
 * pptx rejected), OLE2 extension mapping, the text-not-HTML rules, and all
 * mismatch/edge rejections. The verifier is the server's only type authority —
 * the client's claim never appears here at all.
 */
class ContentVerifierTest {

    private final ContentVerifier verifier = new ContentVerifier();

    private ContentVerifier.Verified verify(String fileName, byte[] content, String... categories) {
        return verifier.verify(fileName, () -> new ByteArrayInputStream(content), List.of(categories));
    }

    private String rejectMessage(String fileName, byte[] content, String... categories) {
        ApiException e = assertThrows(ApiException.class, () -> verify(fileName, content, categories));
        assertEquals(400, e.getStatus(), "verification rejections are 400s");
        return e.getMessage();
    }

    @Test
    void magicBranchesDetectEveryOfferableFormat() {
        assertEquals(new ContentVerifier.Verified("application/pdf", "pdf"),
                verify("a.pdf", TestFiles.pdf(), "DOCUMENTS"));
        assertEquals(new ContentVerifier.Verified("image/png", "png"),
                verify("a.png", TestFiles.png(), "IMAGES"));
        assertEquals(new ContentVerifier.Verified("image/jpeg", "jpg"),
                verify("a.jpg", TestFiles.jpeg(), "IMAGES"));
        assertEquals(new ContentVerifier.Verified("image/jpeg", "jpeg"),
                verify("a.jpeg", TestFiles.jpeg(), "IMAGES"));
        assertEquals(new ContentVerifier.Verified("image/gif", "gif"),
                verify("a.gif", TestFiles.gif(), "IMAGES"));
        assertEquals(new ContentVerifier.Verified("image/webp", "webp"),
                verify("a.webp", TestFiles.webp(), "IMAGES"));
        assertEquals(new ContentVerifier.Verified("application/zip", "zip"),
                verify("a.zip", TestFiles.zip("readme.txt"), "ARCHIVES"));
    }

    @Test
    void ooxmlContainersAreDistinguishedFromRawZip() {
        assertEquals(new ContentVerifier.Verified(
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
                verify("cv.docx", TestFiles.docx(), "DOCUMENTS"));
        assertEquals(new ContentVerifier.Verified(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
                verify("data.xlsx", TestFiles.xlsx(), "SPREADSHEETS"));

        // pptx is not offerable in any category — rejected on content, whatever the name.
        assertTrue(rejectMessage("deck.zip", TestFiles.pptx(), "ARCHIVES").contains("PowerPoint"));

        // A docx renamed .zip is a mismatch, not a zip.
        assertTrue(rejectMessage("cv.zip", TestFiles.docx(), "ARCHIVES").contains("must match"));
    }

    @Test
    void ole2ContainerMapsByExtensionOnly() {
        assertEquals(new ContentVerifier.Verified("application/msword", "doc"),
                verify("old.doc", TestFiles.ole2(), "DOCUMENTS"));
        assertEquals(new ContentVerifier.Verified("application/vnd.ms-excel", "xls"),
                verify("old.xls", TestFiles.ole2(), "SPREADSHEETS"));
        assertTrue(rejectMessage("old.pdf", TestFiles.ole2(), "DOCUMENTS").contains("legacy Office"));
    }

    @Test
    void textFormatsVerifyAsTextWithoutMagic() {
        assertEquals(new ContentVerifier.Verified("text/plain", "txt"),
                verify("notes.txt", TestFiles.text("plain notes\nwith lines\tand tabs"), "TEXT"));
        assertEquals(new ContentVerifier.Verified("text/markdown", "md"),
                verify("readme.md", TestFiles.text("# Title\n\nSome *markdown*."), "TEXT"));
        assertEquals(new ContentVerifier.Verified("text/csv", "csv"),
                verify("data.csv", TestFiles.text("a,b,c\n1,2,3"), "SPREADSHEETS"));
    }

    @Test
    void htmlAndScriptNeverPassAsText() {
        assertTrue(rejectMessage("a.txt", TestFiles.text("<!DOCTYPE html><p>hi</p>"), "TEXT").contains("HTML"));
        assertTrue(rejectMessage("a.txt", TestFiles.text("hello <HTML><b>x</b>"), "TEXT").contains("HTML"));
        assertTrue(rejectMessage("a.txt", TestFiles.text("x <head> y"), "TEXT").contains("HTML"));
        assertTrue(rejectMessage("a.txt", TestFiles.text("x <BODY y"), "TEXT").contains("HTML"));
        assertTrue(rejectMessage("a.md", TestFiles.text("safe? <script>alert(1)</script>"), "TEXT").contains("HTML"));
        assertTrue(rejectMessage("a.csv", TestFiles.text("a,<iframe src=x>,c"), "SPREADSHEETS").contains("HTML"));
        assertTrue(rejectMessage("a.txt", TestFiles.text("an <svg onload=x> image"), "TEXT").contains("HTML"));
        assertTrue(rejectMessage("a.txt", TestFiles.text("<?php echo 'hi'; ?>"), "TEXT").contains("HTML"));
    }

    @Test
    void binaryContentNeverPassesAsText() {
        assertTrue(rejectMessage("a.txt", new byte[]{'h', 'i', 0x00, '!'}, "TEXT").contains("binary"));
        assertTrue(rejectMessage("a.csv", new byte[]{'a', ',', 0x01, 'b'}, "SPREADSHEETS").contains("binary"));
    }

    @Test
    void mismatchesAreRejectedWithClearMessages() {
        // zip renamed .pdf and PNG renamed .pdf (the BRD's canonical examples).
        assertTrue(rejectMessage("report.pdf", TestFiles.zip("x.txt"), "DOCUMENTS", "ARCHIVES")
                .contains("extension and content must match"));
        assertTrue(rejectMessage("scan.pdf", TestFiles.png(), "DOCUMENTS", "IMAGES")
                .contains("extension and content must match"));
        // A "pdf" that is really plain text has no matching magic at all.
        assertTrue(rejectMessage("fake.pdf", TestFiles.text("not a pdf"), "DOCUMENTS")
                .contains("does not match its extension"));
        // Text content named like a magic-bearing image.
        assertTrue(rejectMessage("photo.png", TestFiles.text("not an image"), "IMAGES")
                .contains("does not match its extension"));
    }

    @Test
    void extensionGateEnforcesTheCategoryAllowlist() {
        // Real PDF but the question only allows images.
        assertTrue(rejectMessage("cv.pdf", TestFiles.pdf(), "IMAGES").contains("not allowed"));
        // Raw zip is acceptable only when ARCHIVES is selected.
        assertTrue(rejectMessage("a.zip", TestFiles.zip("x.txt"), "DOCUMENTS").contains("not allowed"));
        // Unknown extensions are always out.
        assertTrue(rejectMessage("run.exe", TestFiles.text("MZ..."), "DOCUMENTS", "IMAGES", "SPREADSHEETS",
                "TEXT", "ARCHIVES").contains("not allowed"));
        // csv is a SPREADSHEETS extension, not a TEXT one.
        assertTrue(rejectMessage("data.csv", TestFiles.text("a,b"), "TEXT").contains("not allowed"));
    }

    @Test
    void emptyAndExtensionlessFilesAreRejected() {
        assertTrue(rejectMessage("a.pdf", new byte[0], "DOCUMENTS").contains("empty"));
        assertTrue(rejectMessage("README", TestFiles.text("hello"), "TEXT").contains("no extension"));
        assertTrue(rejectMessage("trailing.", TestFiles.text("hello"), "TEXT").contains("no extension"));
    }

    @Test
    void corruptZipFallsBackToRawZipClassification() {
        // PK magic but garbage after it: classifies as raw zip, so it can only
        // ever pass as .zip with ARCHIVES...
        byte[] corrupt = {'P', 'K', 0x03, 0x04, 11, 22, 33, 44, 55, 66};
        assertEquals(new ContentVerifier.Verified("application/zip", "zip"),
                verify("odd.zip", corrupt, "ARCHIVES"));
        // ...and a corrupt "docx" is a mismatch.
        assertTrue(rejectMessage("cv.docx", corrupt, "DOCUMENTS").contains("must match"));
    }
}
