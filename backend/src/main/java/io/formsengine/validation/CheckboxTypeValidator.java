package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * CHECKBOX type module (Phase 2 §6.2): RADIO-style options plus an optional
 * {@code maxSelections} (null = unlimited; else an integer ≥ 1 and ≤ option
 * count). EQUALS/NOT_EQUALS are deliberately excluded from its operators
 * (P2-D5) — CONTAINS/NOT_CONTAINS only.
 */
@Component
public class CheckboxTypeValidator implements QuestionTypeValidator {

    @Override
    public String type() {
        return "CHECKBOX";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        List<String> problems = OptionsValidation.validate(type(), config);
        Object maxSelections = config == null ? null : config.get("maxSelections");
        if (maxSelections != null) {
            if (!TypeConfigs.isInteger(maxSelections) || ((Number) maxSelections).doubleValue() < 1) {
                problems.add("CHECKBOX typeConfig.maxSelections must be null or an integer >= 1");
            } else if (config.get("options") instanceof List<?> options
                    && ((Number) maxSelections).doubleValue() > options.size()) {
                problems.add("CHECKBOX typeConfig.maxSelections cannot exceed the number of options");
            }
        }
        return problems;
    }

    @Override
    public Set<String> allowedOperators() {
        return Set.of("CONTAINS", "NOT_CONTAINS");
    }

    @Override
    public ConditionValueKind conditionValueKind() {
        return ConditionValueKind.OPTION;
    }
}
