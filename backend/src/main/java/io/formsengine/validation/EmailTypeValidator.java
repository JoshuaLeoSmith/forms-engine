package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * EMAIL type module (Phase 2 §6.6): {@code typeConfig} is {@code {}} — format
 * validation is client-side; the type exists for validation semantics and
 * future integrations, not configuration.
 */
@Component
public class EmailTypeValidator implements QuestionTypeValidator {

    @Override
    public String type() {
        return "EMAIL";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        return List.of();
    }
}
