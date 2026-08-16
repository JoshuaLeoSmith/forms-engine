package io.formsengine.service;

import io.formsengine.validation.FileCategories;
import io.formsengine.web.ApiException;
import org.springframework.core.io.InputStreamSource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Content verification for uploads (FR3-21, P3-D2): the server determines the
 * file type from <b>content</b> (magic-byte signature inspection), never from
 * the filename extension or the client-declared {@code Content-Type}.
 * Acceptance requires the verified type ∈ the union of the question's selected
 * categories' types AND the extension consistent with that verified type — a
 * {@code .pdf} that is actually a zip, or an "image" that is actually HTML, is
 * rejected with a clear error. The <em>verified</em> type is what gets stored
 * and served on download.
 *
 * <p>Hand-rolled and dependency-free (the BRD allows "Tika or equivalent"):
 * the allowlist is five categories of well-known formats (§5.1), so the
 * signature table is small, deterministic and exhaustively tested. Only a
 * bounded prefix is read for sniffing; zip containers are scanned entry-name
 * by entry-name via a stream (never buffered whole, NFR3-1).
 */
@Component
public class ContentVerifier {

    /** Sniffing reads at most this many leading bytes. */
    static final int PREFIX_BYTES = 8192;
    /** HTML/script sniffing window inside the prefix (FR3-21). */
    static final int HTML_SNIFF_BYTES = 4096;
    /** Upper bound on zip entries examined while classifying a PK container. */
    static final int MAX_ZIP_ENTRIES_SCANNED = 4096;

    private static final byte[] PNG_MAGIC = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    private static final byte[] OLE2_MAGIC = {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0,
            (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1};

    /** Extensions with no magic bytes, verified as text instead (FR3-21). */
    private static final Set<String> TEXT_EXTENSIONS = Set.of("csv", "txt", "md");

    private static final String[] HTML_MARKERS = {
            "<!doctype", "<html", "<head>", "<body", "<script", "<iframe", "<svg", "<?php"};

    /** The verified (content type, extension) pair for an accepted upload. */
    public record Verified(String contentType, String extension) {
    }

    /**
     * Verifies one upload. {@code content} must be re-openable (a spooled
     * multipart file or an in-memory source) — it is opened once for the
     * prefix and, for zip containers, once more for the entry scan.
     *
     * @throws ApiException 400 with a clear message on any rejection
     */
    public Verified verify(String sanitizedFileName, InputStreamSource content, Collection<String> allowedCategories) {
        String extension = extensionOf(sanitizedFileName);
        if (extension == null) {
            throw ApiException.badRequest(
                    "file name has no extension — an extension is required to verify the file type");
        }
        Set<String> allowedExtensions = FileCategories.allowedExtensions(allowedCategories);
        if (!allowedExtensions.contains(extension)) {
            throw ApiException.badRequest("file extension '." + extension
                    + "' is not allowed for this question (allowed extensions: "
                    + String.join(", ", new TreeSet<>(allowedExtensions)) + ")");
        }

        byte[] prefix = readPrefix(content);
        if (prefix.length == 0) {
            throw ApiException.badRequest("file is empty");
        }

        String expectedType = FileCategories.contentTypeForExtension(extension);
        String detectedType = detectByMagic(prefix, extension, content);
        if (detectedType == null) {
            // No magic matched: acceptable only for the text formats, whose
            // verification = extension allowlisted + content sniffs as text +
            // content does not sniff as HTML/script (FR3-21).
            if (!TEXT_EXTENSIONS.contains(extension)) {
                throw ApiException.badRequest("file content does not match its extension '." + extension
                        + "' — the content could not be verified as " + expectedType);
            }
            requireTextNotHtml(prefix);
            detectedType = expectedType;
        } else if (!detectedType.equals(expectedType)) {
            throw ApiException.badRequest("file content is " + detectedType + " but the extension '." + extension
                    + "' implies " + expectedType + " — extension and content must match");
        }
        return new Verified(detectedType, extension);
    }

    /** Lowercased extension after the last dot, or {@code null} when absent. */
    private static String extensionOf(String fileName) {
        if (fileName == null) {
            return null;
        }
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) {
            return null;
        }
        return fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static byte[] readPrefix(InputStreamSource content) {
        try (InputStream in = content.getInputStream()) {
            return in.readNBytes(PREFIX_BYTES);
        } catch (IOException e) {
            throw ApiException.badRequest("file could not be read");
        }
    }

    /**
     * The magic-byte table (FR3-21). Returns the detected content type, or
     * {@code null} when no signature matched. The extension is consulted only
     * where the container format is ambiguous by design (OLE2 legacy Office).
     */
    private String detectByMagic(byte[] prefix, String extension, InputStreamSource content) {
        if (startsWith(prefix, "%PDF-".getBytes(StandardCharsets.US_ASCII))) {
            return "application/pdf";
        }
        if (startsWith(prefix, PNG_MAGIC)) {
            return "image/png";
        }
        if (prefix.length >= 3 && (prefix[0] & 0xFF) == 0xFF && (prefix[1] & 0xFF) == 0xD8 && (prefix[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (startsWith(prefix, "GIF87a".getBytes(StandardCharsets.US_ASCII))
                || startsWith(prefix, "GIF89a".getBytes(StandardCharsets.US_ASCII))) {
            return "image/gif";
        }
        if (prefix.length >= 12 && startsWith(prefix, "RIFF".getBytes(StandardCharsets.US_ASCII))
                && prefix[8] == 'W' && prefix[9] == 'E' && prefix[10] == 'B' && prefix[11] == 'P') {
            return "image/webp";
        }
        if (prefix.length >= 4 && prefix[0] == 'P' && prefix[1] == 'K' && prefix[2] == 0x03 && prefix[3] == 0x04) {
            return classifyZip(content);
        }
        if (startsWith(prefix, OLE2_MAGIC)) {
            // Legacy Office container: doc and xls share the signature, so the
            // (allowlisted) extension disambiguates; anything else is a mismatch.
            return switch (extension) {
                case "doc" -> "application/msword";
                case "xls" -> "application/vnd.ms-excel";
                default -> throw ApiException.badRequest(
                        "file content is a legacy Office container, which is only acceptable as .doc or .xls — "
                                + "the extension '." + extension + "' does not match");
            };
        }
        return null;
    }

    /**
     * PK containers: docx/xlsx are zips distinguished from raw zip by their
     * entry names ({@code [Content_Types].xml} plus {@code word/} or
     * {@code xl/}); pptx is not offerable in any category and is rejected
     * outright; everything else is a raw zip (acceptable only when ARCHIVES is
     * selected, enforced via the extension allowlist).
     */
    private String classifyZip(InputStreamSource content) {
        boolean hasContentTypes = false;
        boolean hasWord = false;
        boolean hasXl = false;
        boolean hasPpt = false;
        try (ZipInputStream zip = new ZipInputStream(content.getInputStream())) {
            ZipEntry entry;
            int scanned = 0;
            while ((entry = zip.getNextEntry()) != null && scanned++ < MAX_ZIP_ENTRIES_SCANNED) {
                String name = entry.getName();
                if ("[Content_Types].xml".equals(name)) {
                    hasContentTypes = true;
                } else if (name.startsWith("word/")) {
                    hasWord = true;
                } else if (name.startsWith("xl/")) {
                    hasXl = true;
                } else if (name.startsWith("ppt/")) {
                    hasPpt = true;
                }
                if (hasContentTypes && (hasWord || hasXl || hasPpt)) {
                    break;
                }
            }
        } catch (IOException e) {
            // Unreadable/corrupt zip structure: fall through as raw zip — a
            // corrupt .docx then fails the extension-consistency check.
        }
        if (hasContentTypes && hasPpt) {
            throw ApiException.badRequest(
                    "file is a PowerPoint (pptx) document, which is not an acceptable upload format in any category");
        }
        if (hasContentTypes && hasWord) {
            return FileCategories.DOCX_TYPE;
        }
        if (hasContentTypes && hasXl) {
            return FileCategories.XLSX_TYPE;
        }
        return "application/zip";
    }

    /**
     * Text verification for csv/txt/md (FR3-21): no NUL or non-whitespace
     * control bytes in the prefix, and the first {@value #HTML_SNIFF_BYTES}
     * bytes must not sniff as HTML/script.
     */
    private static void requireTextNotHtml(byte[] prefix) {
        for (byte b : prefix) {
            int c = b & 0xFF;
            if (c == 0x00 || (c < 0x20 && c != 0x09 && c != 0x0A && c != 0x0D)) {
                throw ApiException.badRequest(
                        "file content is binary, not text — csv/txt/md uploads must contain plain text");
            }
        }
        int sniffLength = Math.min(prefix.length, HTML_SNIFF_BYTES);
        String head = new String(prefix, 0, sniffLength, StandardCharsets.ISO_8859_1).toLowerCase(Locale.ROOT);
        for (String marker : HTML_MARKERS) {
            if (head.contains(marker)) {
                throw ApiException.badRequest(
                        "file content sniffs as HTML or script, which is never an acceptable upload");
            }
        }
    }

    private static boolean startsWith(byte[] data, byte[] magic) {
        if (data.length < magic.length) {
            return false;
        }
        for (int i = 0; i < magic.length; i++) {
            if (data[i] != magic[i]) {
                return false;
            }
        }
        return true;
    }
}
