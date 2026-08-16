package io.formsengine.validation;

/**
 * The JSON type a rule-condition {@code value} must carry when the condition
 * references a question of a given type (FR2-7). Mirrors the renderer
 * registry's {@code conditionValueKind} (Phase 2 §4.1).
 */
public enum ConditionValueKind {

    /** Free-text comparison — value must be a string. */
    TEXT,

    /** Option-label comparison (RADIO, DROPDOWN, CHECKBOX) — value must be a string. */
    OPTION,

    /** Numeric comparison — value must be a JSON number. */
    NUMBER,

    /** Boolean comparison (TOGGLE) — value must be a JSON boolean. */
    BOOLEAN,

    /** Calendar-date comparison — value must be a YYYY-MM-DD string. */
    DATE,

    /** ADDRESS sub-field comparison — value must be a string (FR2-6). */
    ADDRESS,

    /** Never referenceable (DISPLAY_BLOCK, §6.9). */
    NONE
}
