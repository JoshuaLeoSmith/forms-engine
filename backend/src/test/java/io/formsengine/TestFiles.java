package io.formsengine;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Synthesized file contents for the Phase-3 upload tests: real magic bytes for
 * every format in the §5.1 category table, plus the masquerade cases.
 */
public final class TestFiles {

    private TestFiles() {
    }

    /** A tiny but structurally plausible PDF. */
    public static byte[] pdf() {
        return "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n"
                .getBytes(StandardCharsets.US_ASCII);
    }

    /** A PDF padded to exactly {@code totalSize} bytes (for cap tests). */
    public static byte[] pdf(int totalSize) {
        byte[] header = pdf();
        byte[] padded = Arrays.copyOf(header, Math.max(totalSize, header.length));
        Arrays.fill(padded, header.length, padded.length, (byte) ' ');
        return padded;
    }

    public static byte[] png() {
        return bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 'I', 'H', 'D', 'R', 1, 2, 3, 4);
    }

    public static byte[] jpeg() {
        return bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0, 1, 2, 3);
    }

    public static byte[] gif() {
        return "GIF89a1234567890".getBytes(StandardCharsets.US_ASCII);
    }

    public static byte[] webp() {
        return bytes('R', 'I', 'F', 'F', 0x24, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' ');
    }

    /** The OLE2 compound-document signature (legacy .doc / .xls). */
    public static byte[] ole2() {
        return bytes(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    /** A real zip with the given entry names (each holding a few bytes). */
    public static byte[] zip(String... entryNames) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (String name : entryNames) {
                zip.putNextEntry(new ZipEntry(name));
                zip.write(("content of " + name).getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    public static byte[] docx() {
        return zip("[Content_Types].xml", "_rels/.rels", "word/document.xml");
    }

    public static byte[] xlsx() {
        return zip("[Content_Types].xml", "_rels/.rels", "xl/workbook.xml");
    }

    public static byte[] pptx() {
        return zip("[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml");
    }

    public static byte[] text(String content) {
        return content.getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] bytes(int... values) {
        byte[] result = new byte[values.length];
        for (int i = 0; i < values.length; i++) {
            result[i] = (byte) values[i];
        }
        return result;
    }
}
