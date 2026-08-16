package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * DISPLAY_BLOCK type module (Phase 2 §6.9): not a question — no code, never in
 * the answers map, never referenceable by rules, requirement ignored. Its only
 * config is {@code content}, a (sanitized-at-render-time) Markdown string.
 */
@Component
public class DisplayBlockTypeValidator implements QuestionTypeValidator {

    @Override
    public String type() {
        return "DISPLAY_BLOCK";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        Object content = config == null ? null : config.get("content");
        if (!(content instanceof String)) {
            return List.of("DISPLAY_BLOCK typeConfig.content must be a string");
        }
        return List.of();
    }

    @Override
    public boolean answerable() {
        return false;
    }

    @Override
    public Set<String> allowedOperators() {
        return Set.of();
    }

    @Override
    public ConditionValueKind conditionValueKind() {
        return ConditionValueKind.NONE;
    }
}
