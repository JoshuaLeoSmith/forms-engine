package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Rule engine v2 publish validation: the operator/type compatibility matrix
 * (§4.2), ADDRESS sub-field targeting (FR2-6) and typed condition values
 * (FR2-7). All of these are publish-strict, like rule-reference resolution.
 */
class Phase2RuleValidationTest extends BaseApiTest {

    private String questionnaire(String name) {
        return (String) createQuestionnaire(name).get("id");
    }

    private ResponseEntity<Map<String, Object>> draftThenPublish(String id, Map<String, Object> definition) {
        assertEquals(200, putDraft(id, definition).getStatusCode().value(), "draft save should stay lenient");
        return publish(id, null);
    }

    @Test
    void containsOnTextBoxIsRejected() {
        String id = questionnaire("Contains TextBox");
        Map<String, Object> target = Defs.textQuestion("q1", "text1");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("text1", "CONTAINS", "pizza"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "'CONTAINS' which is not allowed for TEXT_BOX"));
    }

    @Test
    void equalsOnCheckboxIsRejected() {
        String id = questionnaire("Equals Checkbox");
        Map<String, Object> target = Defs.checkboxQuestion("q1", "check1", "Mushroom", "Onion");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("check1", "EQUALS", "Mushroom"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "'EQUALS' which is not allowed for CHECKBOX"));
    }

    @Test
    void containsOnCheckboxPublishes() {
        String id = questionnaire("Contains Checkbox");
        Map<String, Object> target = Defs.checkboxQuestion("q1", "check1", "Mushroom", "Onion");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("check1", "CONTAINS", "Mushroom"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(200, resp.getStatusCode().value(), "CONTAINS on CHECKBOX should publish: " + resp.getBody());
    }

    @Test
    void numberConditionRequiresANumericValue() {
        String id = questionnaire("Number Value");
        Map<String, Object> target = Defs.numberQuestion("q1", "num1");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("num1", "GREATER_THAN", "5"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "must be a JSON number"));

        dependent.put("visibility", Defs.conditionalOn("num1", "GREATER_THAN", 5));
        ResponseEntity<Map<String, Object>> ok = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(200, ok.getStatusCode().value(), "numeric value should publish: " + ok.getBody());
    }

    @Test
    void toggleConditionRequiresABooleanValue() {
        String id = questionnaire("Toggle Value");
        Map<String, Object> target = Defs.toggleQuestion("q1", "toggle1");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("toggle1", "EQUALS", "true"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "must be a JSON boolean"));

        dependent.put("visibility", Defs.conditionalOn("toggle1", "EQUALS", true));
        ResponseEntity<Map<String, Object>> ok = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(200, ok.getStatusCode().value(), "boolean value should publish: " + ok.getBody());
    }

    @Test
    void dateConditionValueMustBeAnIsoDate() {
        String id = questionnaire("Date Value");
        Map<String, Object> target = Defs.dateQuestion("q1", "date1");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("date1", "BEFORE", "not-a-date"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "YYYY-MM-DD"));

        dependent.put("visibility", Defs.conditionalOn("date1", "BEFORE", "2026-09-14"));
        ResponseEntity<Map<String, Object>> ok = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(200, ok.getStatusCode().value(), "ISO date value should publish: " + ok.getBody());
    }

    @Test
    void addressConditionWithoutSubFieldIsRejected() {
        String id = questionnaire("Address No SubField");
        Map<String, Object> target = Defs.addressQuestion("q1", "addr1");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("addr1", "EQUALS", "US"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "without a subField"));
    }

    @Test
    void addressConditionWithEnabledSubFieldPublishes() {
        String id = questionnaire("Address SubField OK");
        Map<String, Object> target = Defs.addressQuestion("q1", "addr1");
        Map<String, Object> dependent = Defs.textQuestion("q2", "njOnly");
        dependent.put("visibility", Defs.conditionalOnSubField("addr1", "state", "EQUALS", "NJ"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(200, resp.getStatusCode().value(), "enabled sub-field condition should publish: " + resp.getBody());
    }

    @Test
    void addressConditionOnDisabledSubFieldIsRejected() {
        String id = questionnaire("Address SubField Disabled");
        Map<String, Object> target = Defs.addressQuestion("q1", "addr1");
        @SuppressWarnings("unchecked")
        Map<String, Object> typeConfig = (Map<String, Object>) target.get("typeConfig");
        typeConfig.put("enabledFields", new java.util.LinkedHashMap<>(Map.of("line2", true, "postalCode", true)));
        typeConfig.put("requiredFields", new java.util.LinkedHashMap<>(Map.of("country", true, "line1", true)));
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOnSubField("addr1", "state", "EQUALS", "NJ"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "not an enabled sub-field"));
    }

    @Test
    void subFieldOnNonAddressQuestionIsRejected() {
        String id = questionnaire("SubField NonAddress");
        Map<String, Object> target = Defs.textQuestion("q1", "text1");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOnSubField("text1", "state", "EQUALS", "NJ"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "subField is only valid for ADDRESS questions"));
    }

    @Test
    void ruleReferencingADisplayBlockIsRejected() {
        String id = questionnaire("Display Referenced");
        Map<String, Object> block = Defs.displayBlock("q1", "Notice");
        block.put("code", "info1"); // itself an error, and referencing it is one more
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("info1", "EQUALS", "x"));
        assertEquals(400, putDraft(id, Defs.definitionWithQuestions(block, dependent)).getStatusCode().value(),
                "a display block with a code is already a draft error");

        // Publish path: keep the draft valid, then reference the (code-less)
        // display block by a code that only exists on it — publish must reject
        // the dangling reference; a display block is never a rule target.
        Map<String, Object> cleanBlock = Defs.displayBlock("q1", "Notice");
        Map<String, Object> dangling = Defs.textQuestion("q2", "dep1");
        dangling.put("visibility", Defs.conditionalOn("info1", "EQUALS", "x"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(cleanBlock, dangling));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "unknown question code 'info1'"));
    }

    @Test
    void unsupportedOperatorStringIsStillRejected() {
        String id = questionnaire("Operator Unknown");
        Map<String, Object> target = Defs.textQuestion("q1", "text1");
        Map<String, Object> dependent = Defs.textQuestion("q2", "dep1");
        dependent.put("visibility", Defs.conditionalOn("text1", "FROBNICATE", "x"));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(target, dependent));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "FROBNICATE"));
    }
}
