package io.formsengine.validation;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Shared {@code typeConfig.options} validation for the option-list types
 * (RADIO, CHECKBOX, DROPDOWN — Phase 2 §6.2/§6.3): at least one option, each
 * with non-blank {@code id} and {@code label}.
 */
final class OptionsValidation {

    private OptionsValidation() {
    }

    static List<String> validate(String type, Map<String, Object> config) {
        List<String> problems = new ArrayList<>();
        Object optionsObj = config == null ? null : config.get("options");
        if (!(optionsObj instanceof List<?> options) || options.isEmpty()) {
            problems.add(type + " typeConfig.options must contain at least one option");
            return problems;
        }
        int index = 0;
        for (Object optionObj : options) {
            if (optionObj instanceof Map<?, ?> option) {
                Object id = option.get("id");
                Object label = option.get("label");
                if (!(id instanceof String s) || s.isBlank()) {
                    problems.add(type + " option at index " + index + " must have a non-blank id");
                }
                if (!(label instanceof String l) || l.isBlank()) {
                    problems.add(type + " option at index " + index + " must have a non-blank label");
                }
            } else {
                problems.add(type + " option at index " + index + " must be an object with id and label");
            }
            index++;
        }
        return problems;
    }
}
