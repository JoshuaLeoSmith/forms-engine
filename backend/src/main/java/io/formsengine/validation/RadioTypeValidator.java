package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * RADIO type module (BRD 5.4): {@code typeConfig.options} must contain at least
 * one option, each with non-blank {@code id} and {@code label}.
 */
@Component
public class RadioTypeValidator implements QuestionTypeValidator {

    @Override
    public String type() {
        return "RADIO";
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
