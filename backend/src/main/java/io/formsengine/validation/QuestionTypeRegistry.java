package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Registry of all known question types (BRD 5.4, NFR-6). Collects every
 * {@link QuestionTypeValidator} bean in the application context, so new
 * question types register themselves simply by being beans.
 */
@Component
public class QuestionTypeRegistry {

    private final Map<String, QuestionTypeValidator> validators = new HashMap<>();

    public QuestionTypeRegistry(List<QuestionTypeValidator> typeValidators) {
        for (QuestionTypeValidator v : typeValidators) {
            validators.put(v.type(), v);
        }
    }

    public boolean isKnownType(String type) {
        return type != null && validators.containsKey(type);
    }

    public Optional<QuestionTypeValidator> validatorFor(String type) {
        return Optional.ofNullable(validators.get(type));
    }

    public Set<String> knownTypes() {
        return validators.keySet();
    }
}
