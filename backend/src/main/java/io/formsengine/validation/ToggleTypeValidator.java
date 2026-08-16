package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * TOGGLE type module (Phase 2 §6.7): {@code trueLabel} and {@code falseLabel}
 * must be non-empty strings. The answer is a boolean with no default state
 * (P2-D4) — labels never affect the stored value.
 */
@Component
public class ToggleTypeValidator implements QuestionTypeValidator {

    @Override
    public String type() {
        return "TOGGLE";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        List<String> problems = new ArrayList<>();
        Object trueLabel = config == null ? null : config.get("trueLabel");
        if (!(trueLabel instanceof String s) || s.isBlank()) {
            problems.add("TOGGLE typeConfig.trueLabel must be a non-empty string");
        }
        Object falseLabel = config == null ? null : config.get("falseLabel");
        if (!(falseLabel instanceof String s) || s.isBlank()) {
            problems.add("TOGGLE typeConfig.falseLabel must be a non-empty string");
        }
        return problems;
    }

    @Override
    public ConditionValueKind conditionValueKind() {
        return ConditionValueKind.BOOLEAN;
    }
}
