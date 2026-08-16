package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * PHONE type module (Phase 2 §6.6): {@code typeConfig} is {@code {}} — the
 * permissive format validation is client-side; no country-format enforcement
 * in Phase 2.
 */
@Component
public class PhoneTypeValidator implements QuestionTypeValidator {

    @Override
    public String type() {
        return "PHONE";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        return List.of();
    }
}
