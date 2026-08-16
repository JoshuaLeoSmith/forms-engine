package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * TEXT_BOX type module (BRD 5.4, Phase 2 §6.1): {@code typeConfig.size} must be
 * SMALL | MEDIUM | LARGE; optional {@code maxLength} must be null or an integer
 * between 1 and 10000.
 */
@Component
public class TextBoxTypeValidator implements QuestionTypeValidator {

    private static final Set<String> SIZES = Set.of("SMALL", "MEDIUM", "LARGE");

    @Override
    public String type() {
        return "TEXT_BOX";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        List<String> problems = new ArrayList<>();
        Object size = config == null ? null : config.get("size");
        if (!(size instanceof String) || !SIZES.contains(size)) {
            problems.add("TEXT_BOX typeConfig.size must be one of SMALL, MEDIUM, LARGE");
        }
        Object maxLength = config == null ? null : config.get("maxLength");
        if (maxLength != null && (!TypeConfigs.isInteger(maxLength)
                || ((Number) maxLength).doubleValue() < 1 || ((Number) maxLength).doubleValue() > 10000)) {
            problems.add("TEXT_BOX typeConfig.maxLength must be null or an integer between 1 and 10000");
        }
        return problems;
    }
}
