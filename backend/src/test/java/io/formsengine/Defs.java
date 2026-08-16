package io.formsengine;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builders for definition JSON bodies used across the integration tests.
 * Everything is plain (mutable) maps so individual tests can tweak fields.
 */
public final class Defs {

    private Defs() {
    }

    public static Map<String, Object> emptyDefinition() {
        Map<String, Object> def = new LinkedHashMap<>();
        def.put("schemaVersion", 1);
        def.put("steps", new ArrayList<>());
        def.put("tabs", new ArrayList<>());
        def.put("questions", new ArrayList<>());
        return def;
    }

    /** Flat questionnaire: top-level questions only. */
    @SafeVarargs
    public static Map<String, Object> definitionWithQuestions(Map<String, Object>... questions) {
        Map<String, Object> def = emptyDefinition();
        def.put("questions", new ArrayList<>(Arrays.asList(questions)));
        return def;
    }

    /** Common question scaffold: id, code, prompt, width, ALWAYS visibility/requirement. */
    public static Map<String, Object> question(String id, String code, String type, Map<String, Object> typeConfig) {
        Map<String, Object> q = new LinkedHashMap<>();
        q.put("id", id);
        q.put("code", code);
        q.put("sectionTitle", "Section");
        q.put("prompt", "Prompt for " + code);
        q.put("type", type);
        q.put("width", "DEFAULT");
        q.put("typeConfig", typeConfig);
        q.put("visibility", mode("ALWAYS"));
        q.put("requirement", mode("NEVER"));
        return q;
    }

    public static Map<String, Object> textQuestion(String id, String code) {
        Map<String, Object> q = question(id, code, "TEXT_BOX", new LinkedHashMap<>(Map.of("size", "MEDIUM")));
        q.put("requirement", mode("ALWAYS"));
        return q;
    }

    public static Map<String, Object> radioQuestion(String id, String code, String... labels) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("options", options(labels));
        return question(id, code, "RADIO", typeConfig);
    }

    public static Map<String, Object> checkboxQuestion(String id, String code, String... labels) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("options", options(labels));
        typeConfig.put("maxSelections", null);
        return question(id, code, "CHECKBOX", typeConfig);
    }

    public static Map<String, Object> dropdownQuestion(String id, String code, String... labels) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("options", options(labels));
        return question(id, code, "DROPDOWN", typeConfig);
    }

    public static Map<String, Object> dateQuestion(String id, String code) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("minDate", null);
        typeConfig.put("maxDate", null);
        typeConfig.put("disallowPast", false);
        typeConfig.put("disallowFuture", false);
        return question(id, code, "DATE", typeConfig);
    }

    public static Map<String, Object> numberQuestion(String id, String code) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("min", null);
        typeConfig.put("max", null);
        typeConfig.put("decimalPlaces", null);
        typeConfig.put("adornment", "NONE");
        typeConfig.put("currencySymbol", "$");
        return question(id, code, "NUMBER", typeConfig);
    }

    public static Map<String, Object> emailQuestion(String id, String code) {
        return question(id, code, "EMAIL", new LinkedHashMap<>());
    }

    public static Map<String, Object> phoneQuestion(String id, String code) {
        return question(id, code, "PHONE", new LinkedHashMap<>());
    }

    public static Map<String, Object> toggleQuestion(String id, String code) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("trueLabel", "Yes");
        typeConfig.put("falseLabel", "No");
        return question(id, code, "TOGGLE", typeConfig);
    }

    /** ADDRESS with the default config: line2/state/postalCode enabled, default country US. */
    public static Map<String, Object> addressQuestion(String id, String code) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("enabledFields", new LinkedHashMap<>(Map.of("line2", true, "state", true, "postalCode", true)));
        typeConfig.put("requiredFields", new LinkedHashMap<>(Map.of(
                "country", true, "line1", true, "city", true, "state", true, "postalCode", true)));
        typeConfig.put("defaultCountry", "US");
        typeConfig.put("autocomplete", true);
        return question(id, code, "ADDRESS", typeConfig);
    }

    /** FILE_UPLOAD with the given categories and per-question caps (Phase 3 §5.1). */
    public static Map<String, Object> fileUploadQuestion(String id, String code, List<String> categories,
                                                         int maxFiles, int maxFileSizeMb) {
        Map<String, Object> typeConfig = new LinkedHashMap<>();
        typeConfig.put("allowedCategories", new ArrayList<>(categories));
        typeConfig.put("maxFiles", maxFiles);
        typeConfig.put("maxFileSizeMb", maxFileSizeMb);
        typeConfig.put("helperText", "Upload files here");
        return question(id, code, "FILE_UPLOAD", typeConfig);
    }

    /** DISPLAY_BLOCK: no code, no requirement (§6.9). */
    public static Map<String, Object> displayBlock(String id, String content) {
        Map<String, Object> q = new LinkedHashMap<>();
        q.put("id", id);
        q.put("sectionTitle", "Section");
        q.put("type", "DISPLAY_BLOCK");
        q.put("width", "DEFAULT");
        q.put("typeConfig", new LinkedHashMap<>(Map.of("content", content)));
        q.put("visibility", mode("ALWAYS"));
        return q;
    }

    public static List<Map<String, Object>> options(String... labels) {
        List<Map<String, Object>> options = new ArrayList<>();
        int i = 1;
        for (String label : labels) {
            Map<String, Object> option = new LinkedHashMap<>();
            option.put("id", "o" + i++);
            option.put("label", label);
            options.add(option);
        }
        return options;
    }

    public static Map<String, Object> mode(String mode) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("mode", mode);
        return m;
    }

    /** CONDITIONAL rule config with a single QUESTION condition (typed value, FR2-7). */
    public static Map<String, Object> conditionalOn(String questionCode, String operator, Object value) {
        return conditionalOnSubField(questionCode, null, operator, value);
    }

    /** CONDITIONAL rule config with a single ADDRESS sub-field condition (FR2-6). */
    public static Map<String, Object> conditionalOnSubField(String questionCode, String subField,
                                                            String operator, Object value) {
        Map<String, Object> condition = new LinkedHashMap<>();
        condition.put("source", "QUESTION");
        condition.put("questionCode", questionCode);
        if (subField != null) {
            condition.put("subField", subField);
        }
        condition.put("operator", operator);
        condition.put("value", value);

        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("combinator", "ALL");
        rule.put("conditions", new ArrayList<>(List.of(condition)));

        Map<String, Object> config = new LinkedHashMap<>();
        config.put("mode", "CONDITIONAL");
        config.put("rule", rule);
        return config;
    }
}
