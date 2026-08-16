package io.formsengine.validation;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * The server-owned category → extension → verified-content-type allowlist for
 * FILE_UPLOAD questions (Phase 3 §5.1, FR3-14, P3-D2). The editor offers
 * categories, never raw extensions; every addition to this table is a
 * server-side code change with its content-verification entry (§7).
 * Executables, scripts, HTML and SVG are not offerable in any category, ever.
 */
public final class FileCategories {

    public static final String DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    public static final String XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /** Category → (extension → verified content type), §5.1 table exactly. */
    private static final Map<String, Map<String, String>> CATEGORIES = Map.of(
            "DOCUMENTS", Map.of(
                    "pdf", "application/pdf",
                    "doc", "application/msword",
                    "docx", DOCX_TYPE),
            "IMAGES", Map.of(
                    "jpg", "image/jpeg",
                    "jpeg", "image/jpeg",
                    "png", "image/png",
                    "gif", "image/gif",
                    "webp", "image/webp"),
            "SPREADSHEETS", Map.of(
                    "xls", "application/vnd.ms-excel",
                    "xlsx", XLSX_TYPE,
                    "csv", "text/csv"),
            "TEXT", Map.of(
                    "txt", "text/plain",
                    "md", "text/markdown"),
            "ARCHIVES", Map.of(
                    "zip", "application/zip"));

    private FileCategories() {
    }

    /** True when {@code name} is one of the five offerable categories. */
    public static boolean isKnown(String name) {
        return name != null && CATEGORIES.containsKey(name);
    }

    /** The category names, for validation messages. */
    public static Set<String> names() {
        return CATEGORIES.keySet();
    }

    /** Union of allowed extensions across the given (known) categories. */
    public static Set<String> allowedExtensions(Collection<String> categories) {
        Set<String> extensions = new LinkedHashSet<>();
        for (String category : categories) {
            Map<String, String> byExtension = CATEGORIES.get(category);
            if (byExtension != null) {
                extensions.addAll(byExtension.keySet());
            }
        }
        return extensions;
    }

    /** Extension → verified content type over the whole table (extension is unique across categories). */
    public static String contentTypeForExtension(String extension) {
        for (Map<String, String> byExtension : CATEGORIES.values()) {
            String type = byExtension.get(extension);
            if (type != null) {
                return type;
            }
        }
        return null;
    }

    /** Extension → content type for the given categories only. */
    public static Map<String, String> mappingFor(Collection<String> categories) {
        Map<String, String> mapping = new LinkedHashMap<>();
        for (String category : categories) {
            Map<String, String> byExtension = CATEGORIES.get(category);
            if (byExtension != null) {
                mapping.putAll(byExtension);
            }
        }
        return mapping;
    }
}
