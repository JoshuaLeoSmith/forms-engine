package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * DATE type module (Phase 2 §6.4): {@code minDate}/{@code maxDate} are null or
 * valid {@code YYYY-MM-DD} calendar dates with {@code minDate} ≤ {@code maxDate};
 * {@code disallowPast} and {@code disallowFuture} together are rejected outright.
 */
@Component
public class DateTypeValidator implements QuestionTypeValidator {

    @Override
    public String type() {
        return "DATE";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        List<String> problems = new ArrayList<>();
        String minDate = validDateOrReport(problems, config, "minDate");
        String maxDate = validDateOrReport(problems, config, "maxDate");
        if (minDate != null && maxDate != null && minDate.compareTo(maxDate) > 0) {
            problems.add("DATE typeConfig.minDate must not be after maxDate");
        }
        Object disallowPast = config == null ? null : config.get("disallowPast");
        Object disallowFuture = config == null ? null : config.get("disallowFuture");
        if (Boolean.TRUE.equals(disallowPast) && Boolean.TRUE.equals(disallowFuture)) {
            problems.add("DATE typeConfig: no valid dates would remain except today; use min/max instead");
        }
        return problems;
    }

    /** Returns the valid date string, or null (reporting a problem when the value is present but invalid). */
    private static String validDateOrReport(List<String> problems, Map<String, Object> config, String key) {
        Object value = config == null ? null : config.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof String s && IsoDates.isValid(s)) {
            return s;
        }
        problems.add("DATE typeConfig." + key + " must be null or a valid YYYY-MM-DD date");
        return null;
    }

    @Override
    public Set<String> allowedOperators() {
        return Set.of("EQUALS", "NOT_EQUALS", "BEFORE", "AFTER");
    }

    @Override
    public ConditionValueKind conditionValueKind() {
        return ConditionValueKind.DATE;
    }
}
