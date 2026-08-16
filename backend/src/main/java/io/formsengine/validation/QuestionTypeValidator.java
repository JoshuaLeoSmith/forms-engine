package io.formsengine.validation;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Extension point for question types (BRD 5.4, NFR-6). Adding a new type means
 * adding one new Spring bean implementing this interface — the registry picks it
 * up automatically; no core code changes. Per Phase 2 §4.2 the operator/type
 * compatibility matrix lives here (each type declares its allowed operators),
 * not in rule-engine core.
 */
public interface QuestionTypeValidator {

    /** The type identifier this validator handles, e.g. {@code TEXT_BOX}. */
    String type();

    /**
     * Validates the per-type {@code typeConfig} payload for publish (strict) validation.
     *
     * @param config the question's typeConfig map, may be {@code null}
     * @return human-readable problems; empty when valid
     */
    List<String> validateConfig(Map<String, Object> config);

    /**
     * False for DISPLAY_BLOCK-style content entries: no code, never in the
     * answers map, never referenceable by rules (Phase 2 §6.9).
     */
    default boolean answerable() {
        return true;
    }

    /**
     * Operators legal when a rule condition references a question of this type
     * (Phase 2 §4.2). Empty = never referenceable.
     */
    default Set<String> allowedOperators() {
        return Set.of("EQUALS", "NOT_EQUALS");
    }

    /** The JSON type a condition {@code value} must carry for this target type (FR2-7). */
    default ConditionValueKind conditionValueKind() {
        return ConditionValueKind.TEXT;
    }
}
