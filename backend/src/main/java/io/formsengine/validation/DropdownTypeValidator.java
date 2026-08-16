package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * DROPDOWN type module (Phase 2 §6.3): same options shape and validation as
 * RADIO; the search filter is purely client-side.
 */
@Component
public class DropdownTypeValidator implements QuestionTypeValidator {

    @Override
    public String type() {
        return "DROPDOWN";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        return OptionsValidation.validate(type(), config);
    }

    @Override
    public ConditionValueKind conditionValueKind() {
        return ConditionValueKind.OPTION;
    }
}
