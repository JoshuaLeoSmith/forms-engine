package io.formsengine.validation;

import io.formsengine.definition.Condition;
import io.formsengine.definition.Definition;
import io.formsengine.definition.Question;
import io.formsengine.definition.Rule;
import io.formsengine.definition.RuleConfig;
import io.formsengine.definition.Step;
import io.formsengine.definition.Tab;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Server-side definition validation (FR-B-1, BRD 5.1, 5.3, NFR-5; Phase 2
 * FR2-1, FR2-3, FR2-6, FR2-7).
 *
 * <p>Two levels:
 * <ul>
 *   <li><b>DRAFT</b> (lenient): schema version, structural constraint, ids, code
 *       pattern/uniqueness, known types, enum values — but tolerates in-progress
 *       incompleteness such as a radio question without options or a dangling rule
 *       reference.</li>
 *   <li><b>PUBLISH</b> (strict): all draft rules plus rule-reference resolution,
 *       self-reference rejection, per-type typeConfig validation, the operator/type
 *       compatibility matrix (Phase 2 §4.2), ADDRESS sub-field targeting (FR2-6),
 *       typed condition values (FR2-7), and a non-empty questionnaire.</li>
 * </ul>
 *
 * <p>All problems are collected into one list — validation never stops at the
 * first failure.
 */
@Component
public class DefinitionValidator {

    /** BRD 5.3 question-code pattern; also the answers-map key pattern (FR2-5). */
    public static final Pattern CODE_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_-]{0,63}$");

    private static final Set<String> WIDTHS = Set.of("DEFAULT", "HALF", "FULL");
    private static final Set<String> MODES = Set.of("ALWAYS", "CONDITIONAL", "NEVER");
    private static final Set<String> COMBINATORS = Set.of("ALL", "ANY");

    /** The open operator enum as of schemaVersion 2 (Phase 2 §1.2). */
    private static final Set<String> KNOWN_OPERATORS = Set.of(
            "EQUALS", "NOT_EQUALS", "CONTAINS", "NOT_CONTAINS",
            "GREATER_THAN", "LESS_THAN", "BEFORE", "AFTER");

    private final QuestionTypeRegistry typeRegistry;

    public DefinitionValidator(QuestionTypeRegistry typeRegistry) {
        this.typeRegistry = typeRegistry;
    }

    /** Lenient validation for autosaved drafts (PUT /draft). */
    public List<String> validateDraft(Definition definition) {
        return validate(definition, false);
    }

    /** Strict validation for publish (FR-E-16). */
    public List<String> validatePublish(Definition definition) {
        return validate(definition, true);
    }

    private List<String> validate(Definition definition, boolean strict) {
        List<String> problems = new ArrayList<>();

        if (definition == null) {
            problems.add("definition body is required");
            return problems;
        }

        // NFR-5: refuse unknown schemaVersion. Versions 1 and 2 are both
        // accepted for draft save and publish (FR2-1); published version
        // documents keep whatever schemaVersion they were published with.
        int schemaVersion = definition.getSchemaVersion();
        if (schemaVersion != 1 && schemaVersion != 2) {
            problems.add("unknown schemaVersion " + schemaVersion + " (this backend supports schemaVersion 1 and 2)");
        }

        // BRD 5.1 structural constraint at the questionnaire level.
        int nonEmpty = 0;
        if (!definition.getSteps().isEmpty()) {
            nonEmpty++;
        }
        if (!definition.getTabs().isEmpty()) {
            nonEmpty++;
        }
        if (!definition.getQuestions().isEmpty()) {
            nonEmpty++;
        }
        if (nonEmpty > 1) {
            problems.add("questionnaire must use at most one of steps, tabs or questions at the top level");
        }

        List<Question> allQuestions = new ArrayList<>();

        for (Step step : definition.getSteps()) {
            String stepLabel = "step '" + labelOf(step.getTitle(), step.getId()) + "'";
            if (isBlank(step.getId())) {
                problems.add(stepLabel + " is missing an id");
            }
            if (!step.getTabs().isEmpty() && !step.getQuestions().isEmpty()) {
                problems.add(stepLabel + " must contain either tabs or questions, not both");
            }
            validateRuleConfig(problems, step.getVisibility(), "visibility of " + stepLabel, strict);
            validateRuleConfig(problems, step.getRequirement(), "requirement of " + stepLabel, strict);

            for (Tab tab : step.getTabs()) {
                String tabLabel = "tab '" + labelOf(tab.getTitle(), tab.getId()) + "'";
                if (isBlank(tab.getId())) {
                    problems.add(tabLabel + " is missing an id");
                }
                validateRuleConfig(problems, tab.getVisibility(), "visibility of " + tabLabel, strict);
                validateRuleConfig(problems, tab.getRequirement(), "requirement of " + tabLabel, strict);
                allQuestions.addAll(tab.getQuestions());
                for (Question q : tab.getQuestions()) {
                    validateQuestionBasics(problems, q, strict);
                }
            }
            allQuestions.addAll(step.getQuestions());
            for (Question q : step.getQuestions()) {
                validateQuestionBasics(problems, q, strict);
            }
        }

        for (Tab tab : definition.getTabs()) {
            String tabLabel = "tab '" + labelOf(tab.getTitle(), tab.getId()) + "'";
            if (isBlank(tab.getId())) {
                problems.add(tabLabel + " is missing an id");
            }
            validateRuleConfig(problems, tab.getVisibility(), "visibility of " + tabLabel, strict);
            validateRuleConfig(problems, tab.getRequirement(), "requirement of " + tabLabel, strict);
            allQuestions.addAll(tab.getQuestions());
            for (Question q : tab.getQuestions()) {
                validateQuestionBasics(problems, q, strict);
            }
        }

        allQuestions.addAll(definition.getQuestions());
        for (Question q : definition.getQuestions()) {
            validateQuestionBasics(problems, q, strict);
        }

        // Code uniqueness (case-sensitive), BRD 5.3. DISPLAY_BLOCK-style
        // entries have no code and are excluded (§6.9).
        Set<String> seen = new HashSet<>();
        Set<String> reported = new HashSet<>();
        for (Question q : allQuestions) {
            if (!isAnswerable(q.getType())) {
                continue;
            }
            String code = q.getCode();
            if (code == null || code.isBlank()) {
                continue;
            }
            if (!seen.add(code) && reported.add(code)) {
                problems.add("question code '" + code + "' is used more than once — codes must be unique within a questionnaire");
            }
        }

        if (strict) {
            validateStrict(problems, definition, allQuestions);
        }

        return problems;
    }

    private void validateStrict(List<String> problems, Definition definition, List<Question> allQuestions) {
        if (allQuestions.isEmpty()) {
            problems.add("questionnaire has no questions");
        }

        // Rule targets by code. Non-answerable entries (DISPLAY_BLOCK) should
        // not carry a code at all; when one erroneously does, references to it
        // are still rejected with a pointed message (§6.9).
        Map<String, Question> questionsByCode = new HashMap<>();
        Set<String> unreferenceableCodes = new HashSet<>();
        for (Question q : allQuestions) {
            String code = q.getCode();
            if (code == null || code.isBlank()) {
                continue;
            }
            if (isAnswerable(q.getType())) {
                questionsByCode.putIfAbsent(code, q);
            } else {
                unreferenceableCodes.add(code);
            }
        }

        // Rule references on container-level rules (steps and tabs).
        for (Step step : definition.getSteps()) {
            String stepLabel = "step '" + labelOf(step.getTitle(), step.getId()) + "'";
            checkRuleReferences(problems, step.getVisibility(), "visibility rule on " + stepLabel, null, questionsByCode, unreferenceableCodes);
            checkRuleReferences(problems, step.getRequirement(), "requirement rule on " + stepLabel, null, questionsByCode, unreferenceableCodes);
            for (Tab tab : step.getTabs()) {
                String tabLabel = "tab '" + labelOf(tab.getTitle(), tab.getId()) + "'";
                checkRuleReferences(problems, tab.getVisibility(), "visibility rule on " + tabLabel, null, questionsByCode, unreferenceableCodes);
                checkRuleReferences(problems, tab.getRequirement(), "requirement rule on " + tabLabel, null, questionsByCode, unreferenceableCodes);
            }
        }
        for (Tab tab : definition.getTabs()) {
            String tabLabel = "tab '" + labelOf(tab.getTitle(), tab.getId()) + "'";
            checkRuleReferences(problems, tab.getVisibility(), "visibility rule on " + tabLabel, null, questionsByCode, unreferenceableCodes);
            checkRuleReferences(problems, tab.getRequirement(), "requirement rule on " + tabLabel, null, questionsByCode, unreferenceableCodes);
        }

        // Question-level rules and typeConfig.
        for (Question q : allQuestions) {
            String qLabel = "question '" + labelOf(q.getCode(), q.getId()) + "'";
            boolean answerable = isAnswerable(q.getType());
            String ownCode = answerable ? q.getCode() : null;
            checkRuleReferences(problems, q.getVisibility(), "visibility rule on " + qLabel, ownCode, questionsByCode, unreferenceableCodes);
            if (answerable) {
                // Requirement is ignored on DISPLAY_BLOCK-style entries (§6.9).
                checkRuleReferences(problems, q.getRequirement(), "requirement rule on " + qLabel, ownCode, questionsByCode, unreferenceableCodes);
            }

            if (q.getType() != null) {
                typeRegistry.validatorFor(q.getType()).ifPresent(v -> {
                    for (String problem : v.validateConfig(q.getTypeConfig())) {
                        problems.add(qLabel + ": " + problem);
                    }
                });
            }
        }
    }

    private void checkRuleReferences(List<String> problems, RuleConfig config, String where, String ownCode,
                                     Map<String, Question> questionsByCode, Set<String> unreferenceableCodes) {
        if (config == null || config.getRule() == null) {
            return;
        }
        Rule rule = config.getRule();
        for (Condition c : rule.getConditions()) {
            if (c == null) {
                continue;
            }
            String operator = c.getOperator();
            if (operator == null || !KNOWN_OPERATORS.contains(operator)) {
                problems.add(where + " uses unsupported operator '" + operator + "' (supported operators: "
                        + String.join(", ", new TreeSet<>(KNOWN_OPERATORS)) + ")");
            }
            if (!"QUESTION".equals(c.getSource())) {
                continue;
            }
            String ref = c.getQuestionCode();
            if (ref == null || ref.isBlank()) {
                problems.add(where + " has a condition without a questionCode");
                continue;
            }
            if (ownCode != null && ref.equals(ownCode)) {
                problems.add(where + " references its own code '" + ownCode + "' — self-references are not allowed");
                continue;
            }
            Question target = questionsByCode.get(ref);
            if (target == null) {
                if (unreferenceableCodes.contains(ref)) {
                    problems.add(where + " references display block '" + ref
                            + "' — display blocks can never be referenced by rule conditions");
                } else {
                    problems.add(where + " references unknown question code '" + ref + "'");
                }
                continue;
            }
            checkConditionAgainstTarget(problems, c, target, where);
        }
    }

    /**
     * Phase-2 per-condition checks against the resolved target question: the
     * operator/type matrix (§4.2), ADDRESS sub-field targeting (FR2-6) and
     * typed condition values (FR2-7).
     */
    private void checkConditionAgainstTarget(List<String> problems, Condition c, Question target, String where) {
        String type = target.getType();
        QuestionTypeValidator module = typeRegistry.validatorFor(type).orElse(null);
        if (module == null) {
            // Unknown target type is already reported by validateQuestionBasics.
            return;
        }
        String ref = target.getCode();
        String operator = c.getOperator();
        Set<String> allowed = module.allowedOperators();
        if (operator != null && KNOWN_OPERATORS.contains(operator) && !allowed.contains(operator)) {
            problems.add(where + " uses operator '" + operator + "' which is not allowed for " + type
                    + " question '" + ref + "' (allowed: " + String.join(", ", new TreeSet<>(allowed)) + ")");
        }

        // FR2-6: subField is mandatory on ADDRESS targets (whole-object
        // comparison is meaningless) and forbidden everywhere else.
        String subField = c.getSubField();
        if ("ADDRESS".equals(type)) {
            if (subField == null || subField.isBlank()) {
                problems.add(where + " has a condition on ADDRESS question '" + ref
                        + "' without a subField — address conditions must target a sub-field");
            } else if (!AddressTypeValidator.enabledSubFields(target.getTypeConfig()).contains(subField)) {
                problems.add(where + " uses subField '" + subField
                        + "' which is not an enabled sub-field of ADDRESS question '" + ref + "'");
            }
        } else if (subField != null && !subField.isBlank()) {
            problems.add(where + " has a subField on a condition referencing " + type + " question '" + ref
                    + "' — subField is only valid for ADDRESS questions");
        }

        // FR2-7: the condition value is stored as the JSON type the operator compares.
        Object value = c.getValue();
        switch (module.conditionValueKind()) {
            case NUMBER -> {
                if (!(value instanceof Number n) || !Double.isFinite(n.doubleValue())) {
                    problems.add(where + " has a condition on NUMBER question '" + ref
                            + "' whose value must be a JSON number");
                }
            }
            case BOOLEAN -> {
                if (!(value instanceof Boolean)) {
                    problems.add(where + " has a condition on TOGGLE question '" + ref
                            + "' whose value must be a JSON boolean");
                }
            }
            case DATE -> {
                if (!(value instanceof String s) || !IsoDates.isValid(s)) {
                    problems.add(where + " has a condition on DATE question '" + ref
                            + "' whose value must be a YYYY-MM-DD date string");
                }
            }
            case NONE -> {
                // Unreferenceable targets are rejected before this point.
            }
            default -> {
                if (!(value instanceof String)) {
                    problems.add(where + " has a condition on " + type + " question '" + ref
                            + "' whose value must be a string");
                }
            }
        }
    }

    private void validateQuestionBasics(List<String> problems, Question q, boolean strict) {
        String qLabel = "question '" + labelOf(q.getCode(), q.getId()) + "'";

        if (isBlank(q.getId())) {
            problems.add(qLabel + " is missing an id");
        }
        if (isAnswerable(q.getType())) {
            if (q.getCode() == null || q.getCode().isBlank()) {
                problems.add(qLabel + " is missing a code");
            } else if (!CODE_PATTERN.matcher(q.getCode()).matches()) {
                problems.add("question code '" + q.getCode()
                        + "' is invalid — codes must start with a letter and contain only letters, digits, '_' or '-' (max 64 chars)");
            }
        } else if (q.getCode() != null && !q.getCode().isBlank()) {
            // §6.9: display blocks are not questions and must not have a code.
            problems.add(qLabel + " has type " + q.getType() + " and must not have a code");
        }
        if (!typeRegistry.isKnownType(q.getType())) {
            problems.add(qLabel + " has unknown type '" + q.getType() + "' (known types: "
                    + String.join(", ", new java.util.TreeSet<>(typeRegistry.knownTypes())) + ")");
        }
        if (q.getWidth() != null && !WIDTHS.contains(q.getWidth())) {
            problems.add(qLabel + " has invalid width '" + q.getWidth() + "' (must be DEFAULT, HALF or FULL)");
        }
        validateRuleConfig(problems, q.getVisibility(), "visibility of " + qLabel, strict);
        if (isAnswerable(q.getType())) {
            validateRuleConfig(problems, q.getRequirement(), "requirement of " + qLabel, strict);
        }
    }

    private void validateRuleConfig(List<String> problems, RuleConfig config, String where, boolean strict) {
        if (config == null) {
            return;
        }
        if (config.getMode() == null || !MODES.contains(config.getMode())) {
            problems.add(where + " has invalid mode '" + config.getMode() + "' (must be ALWAYS, CONDITIONAL or NEVER)");
        }
        Rule rule = config.getRule();
        if (rule != null) {
            if (rule.getCombinator() == null || !COMBINATORS.contains(rule.getCombinator())) {
                problems.add(where + " has invalid combinator '" + rule.getCombinator() + "' (must be ALL or ANY)");
            }
        }
    }

    /** False only for known non-question types (DISPLAY_BLOCK, §6.9). */
    private boolean isAnswerable(String type) {
        return typeRegistry.validatorFor(type).map(QuestionTypeValidator::answerable).orElse(true);
    }

    private static String labelOf(String preferred, String fallback) {
        if (preferred != null && !preferred.isBlank()) {
            return preferred;
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback;
        }
        return "(unnamed)";
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
