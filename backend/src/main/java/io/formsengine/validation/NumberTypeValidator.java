package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * NUMBER type module (Phase 2 §6.5): {@code min}/{@code max} null or numbers
 * with {@code min} ≤ {@code max}; {@code decimalPlaces} null or an integer 0–10;
 * {@code adornment} NONE | PERCENT | CURRENCY; {@code currencySymbol} a string
 * of at most 4 characters. Adornments are purely cosmetic — the stored answer
 * is always the bare number.
 */
@Component
public class NumberTypeValidator implements QuestionTypeValidator {

    private static final Set<String> ADORNMENTS = Set.of("NONE", "PERCENT", "CURRENCY");

    @Override
    public String type() {
        return "NUMBER";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        List<String> problems = new ArrayList<>();
        Object min = config == null ? null : config.get("min");
        Object max = config == null ? null : config.get("max");
        if (min != null && !TypeConfigs.isFiniteNumber(min)) {
            problems.add("NUMBER typeConfig.min must be null or a number");
        }
        if (max != null && !TypeConfigs.isFiniteNumber(max)) {
            problems.add("NUMBER typeConfig.max must be null or a number");
        }
        if (TypeConfigs.isFiniteNumber(min) && TypeConfigs.isFiniteNumber(max)
                && ((Number) min).doubleValue() > ((Number) max).doubleValue()) {
            problems.add("NUMBER typeConfig.min must not be greater than max");
        }
        Object decimalPlaces = config == null ? null : config.get("decimalPlaces");
        if (decimalPlaces != null && (!TypeConfigs.isInteger(decimalPlaces)
                || ((Number) decimalPlaces).doubleValue() < 0 || ((Number) decimalPlaces).doubleValue() > 10)) {
            problems.add("NUMBER typeConfig.decimalPlaces must be null or an integer between 0 and 10");
        }
        if (config != null && config.containsKey("adornment")) {
            Object adornment = config.get("adornment");
            if (!(adornment instanceof String s) || !ADORNMENTS.contains(s)) {
                problems.add("NUMBER typeConfig.adornment must be NONE, PERCENT or CURRENCY");
            }
        }
        if (config != null && config.containsKey("currencySymbol")) {
            Object symbol = config.get("currencySymbol");
            if (!(symbol instanceof String s) || s.length() > 4) {
                problems.add("NUMBER typeConfig.currencySymbol must be a string of at most 4 characters");
            }
        }
        return problems;
    }

    @Override
    public Set<String> allowedOperators() {
        return Set.of("EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN");
    }

    @Override
    public ConditionValueKind conditionValueKind() {
        return ConditionValueKind.NUMBER;
    }
}
