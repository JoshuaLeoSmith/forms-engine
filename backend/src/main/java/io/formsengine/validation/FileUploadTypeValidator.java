package io.formsengine.validation;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * FILE_UPLOAD type module (Phase 3 §5.1): {@code allowedCategories} a non-empty
 * subset of the five offerable categories (FR3-14); {@code maxFiles} 1–10;
 * {@code maxFileSizeMb} 1 – the system cap ({@code MAX_FILE_SIZE_MB}, FR3-19),
 * which also bounds the editor input; {@code helperText} optional, ≤ 500 chars.
 *
 * <p>Declares no operators (like DISPLAY_BLOCK) — rule conditions can never
 * reference an upload question (§1, P3-D6); an "is answered" operator, if ever
 * wanted, is a rule-engine feature for all types.
 */
@Component
public class FileUploadTypeValidator implements QuestionTypeValidator {

    static final int MAX_FILES_LIMIT = 10;
    static final int MAX_HELPER_TEXT_CHARS = 500;

    private final int systemCapMb;

    public FileUploadTypeValidator(@Value("${forms.uploads.max-file-size-mb:50}") int systemCapMb) {
        this.systemCapMb = systemCapMb;
    }

    @Override
    public String type() {
        return "FILE_UPLOAD";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        List<String> problems = new ArrayList<>();

        Object categories = config == null ? null : config.get("allowedCategories");
        if (!(categories instanceof List<?> list) || list.isEmpty()) {
            problems.add("FILE_UPLOAD typeConfig.allowedCategories must be a non-empty array of categories ("
                    + String.join(", ", new TreeSet<>(FileCategories.names())) + ")");
        } else {
            for (Object category : list) {
                if (!(category instanceof String s) || !FileCategories.isKnown(s)) {
                    problems.add("FILE_UPLOAD typeConfig.allowedCategories contains unknown category '" + category
                            + "' (known categories: " + String.join(", ", new TreeSet<>(FileCategories.names())) + ")");
                }
            }
        }

        Object maxFiles = config == null ? null : config.get("maxFiles");
        if (!TypeConfigs.isInteger(maxFiles) || ((Number) maxFiles).doubleValue() < 1
                || ((Number) maxFiles).doubleValue() > MAX_FILES_LIMIT) {
            problems.add("FILE_UPLOAD typeConfig.maxFiles must be an integer between 1 and " + MAX_FILES_LIMIT);
        }

        Object maxFileSizeMb = config == null ? null : config.get("maxFileSizeMb");
        if (!TypeConfigs.isInteger(maxFileSizeMb) || ((Number) maxFileSizeMb).doubleValue() < 1
                || ((Number) maxFileSizeMb).doubleValue() > systemCapMb) {
            problems.add("FILE_UPLOAD typeConfig.maxFileSizeMb must be an integer between 1 and " + systemCapMb
                    + " (the system cap, MAX_FILE_SIZE_MB)");
        }

        if (config != null && config.get("helperText") != null) {
            Object helperText = config.get("helperText");
            if (!(helperText instanceof String s) || s.length() > MAX_HELPER_TEXT_CHARS) {
                problems.add("FILE_UPLOAD typeConfig.helperText must be null or a string of at most "
                        + MAX_HELPER_TEXT_CHARS + " characters");
            }
        }

        return problems;
    }

    /** No operators — never referenceable by rule conditions (P3-D6). */
    @Override
    public Set<String> allowedOperators() {
        return Set.of();
    }

    @Override
    public ConditionValueKind conditionValueKind() {
        return ConditionValueKind.NONE;
    }
}
