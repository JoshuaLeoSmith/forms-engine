package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Per-type typeConfig validation for the Phase-2 question types (FR2-3, §6).
 * Drafts stay lenient (typeConfig problems only block publish); each type has
 * a publish happy path and at least one publish failure.
 */
class Phase2TypeValidationTest extends BaseApiTest {

    private String questionnaire(String name) {
        return (String) createQuestionnaire(name).get("id");
    }

    /** Saves the draft (expects 200 — drafts are lenient) and returns the publish response. */
    private ResponseEntity<Map<String, Object>> draftThenPublish(String id, Map<String, Object> definition) {
        assertEquals(200, putDraft(id, definition).getStatusCode().value(), "draft save should stay lenient");
        return publish(id, null);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> typeConfig(Map<String, Object> question) {
        return (Map<String, Object>) question.get("typeConfig");
    }

    @Test
    void publishAcceptsEveryPhase2TypeHappyPath() {
        String id = questionnaire("Phase2 Happy");
        Map<String, Object> textBox = Defs.textQuestion("q1", "text1");
        typeConfig(textBox).put("maxLength", 500);
        Map<String, Object> checkbox = Defs.checkboxQuestion("q2", "check1", "Mushroom", "Onion");
        typeConfig(checkbox).put("maxSelections", 2);
        Map<String, Object> date = Defs.dateQuestion("q4", "date1");
        typeConfig(date).put("minDate", "2026-01-01");
        typeConfig(date).put("maxDate", "2026-12-31");
        Map<String, Object> number = Defs.numberQuestion("q5", "num1");
        typeConfig(number).put("min", 0);
        typeConfig(number).put("max", 100);
        typeConfig(number).put("decimalPlaces", 2);
        typeConfig(number).put("adornment", "CURRENCY");

        ResponseEntity<Map<String, Object>> published = draftThenPublish(id, Defs.definitionWithQuestions(
                textBox,
                checkbox,
                Defs.dropdownQuestion("q3", "drop1", "Cake", "Ice Cream"),
                date,
                number,
                Defs.emailQuestion("q6", "email1"),
                Defs.phoneQuestion("q7", "phone1"),
                Defs.toggleQuestion("q8", "toggle1"),
                Defs.addressQuestion("q9", "addr1"),
                Defs.displayBlock("q10", "Some **bold** text")));
        assertEquals(200, published.getStatusCode().value(),
                "publish should accept every Phase-2 type: " + published.getBody());
    }

    @Test
    void checkboxMaxSelectionsCannotExceedOptionCount() {
        String id = questionnaire("Checkbox Max");
        Map<String, Object> checkbox = Defs.checkboxQuestion("q1", "check1", "A", "B");
        typeConfig(checkbox).put("maxSelections", 3);
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(checkbox));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "maxSelections"));
    }

    @Test
    void checkboxWithZeroOptionsRejectedOnPublishOnly() {
        String id = questionnaire("Checkbox Empty");
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id,
                Defs.definitionWithQuestions(Defs.checkboxQuestion("q1", "check1")));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "option"));
    }

    @Test
    void dropdownWithZeroOptionsRejectedOnPublish() {
        String id = questionnaire("Dropdown Empty");
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id,
                Defs.definitionWithQuestions(Defs.dropdownQuestion("q1", "drop1")));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "option"));
    }

    @Test
    void dateDisallowingBothPastAndFutureIsBlocked() {
        String id = questionnaire("Date Both");
        Map<String, Object> date = Defs.dateQuestion("q1", "date1");
        typeConfig(date).put("disallowPast", true);
        typeConfig(date).put("disallowFuture", true);
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(date));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "no valid dates would remain except today; use min/max instead"));
    }

    @Test
    void dateRejectsInvalidAndInvertedRange() {
        String id = questionnaire("Date Range");
        Map<String, Object> date = Defs.dateQuestion("q1", "date1");
        typeConfig(date).put("minDate", "2026-12-31");
        typeConfig(date).put("maxDate", "2026-01-01");
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(date));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "minDate"));

        typeConfig(date).put("minDate", "2026-02-30"); // not a calendar date
        typeConfig(date).put("maxDate", null);
        ResponseEntity<Map<String, Object>> invalid = draftThenPublish(id, Defs.definitionWithQuestions(date));
        assertEquals(400, invalid.getStatusCode().value());
        assertTrue(anyErrorContains(invalid.getBody(), "minDate"));
    }

    @Test
    void numberRejectsMinAboveMaxAndBadDecimalPlaces() {
        String id = questionnaire("Number Bad");
        Map<String, Object> number = Defs.numberQuestion("q1", "num1");
        typeConfig(number).put("min", 10);
        typeConfig(number).put("max", 1);
        typeConfig(number).put("decimalPlaces", 11);
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(number));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "min must not be greater than max"));
        assertTrue(anyErrorContains(resp.getBody(), "decimalPlaces"));
    }

    @Test
    void numberRejectsUnknownAdornment() {
        String id = questionnaire("Number Adorn");
        Map<String, Object> number = Defs.numberQuestion("q1", "num1");
        typeConfig(number).put("adornment", "EMOJI");
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(number));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "adornment"));
    }

    @Test
    void toggleRejectsBlankLabels() {
        String id = questionnaire("Toggle Blank");
        Map<String, Object> toggle = Defs.toggleQuestion("q1", "toggle1");
        typeConfig(toggle).put("trueLabel", "");
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(toggle));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "trueLabel"));
    }

    @Test
    void addressRequiredSubFieldMustBeEnabled() {
        String id = questionnaire("Address Required");
        Map<String, Object> address = Defs.addressQuestion("q1", "addr1");
        typeConfig(address).put("enabledFields", new LinkedHashMap<>(Map.of("line2", true)));
        // state stays required but is no longer enabled.
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(address));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "must also be enabled"));
    }

    @Test
    void addressRejectsUnknownSubFieldAndBadDefaultCountry() {
        String id = questionnaire("Address Unknown");
        Map<String, Object> address = Defs.addressQuestion("q1", "addr1");
        typeConfig(address).put("enabledFields", new LinkedHashMap<>(Map.of("zipCode", true)));
        typeConfig(address).put("defaultCountry", "usa");
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(address));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "unknown sub-field 'zipCode'"));
        assertTrue(anyErrorContains(resp.getBody(), "defaultCountry"));
    }

    @Test
    void textBoxMaxLengthMustBeWithinRange() {
        String id = questionnaire("TextBox MaxLength");
        Map<String, Object> textBox = Defs.textQuestion("q1", "text1");
        typeConfig(textBox).put("maxLength", 0);
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(textBox));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "maxLength"));
    }

    @Test
    void displayBlockContentMustBeAString() {
        String id = questionnaire("Display Content");
        Map<String, Object> block = Defs.displayBlock("q1", "ignored");
        block.put("typeConfig", new LinkedHashMap<>(Map.of("content", 42)));
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(
                Defs.textQuestion("q2", "text1"), block));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "content must be a string"));
    }

    @Test
    void displayBlockMustNotHaveACode() {
        String id = questionnaire("Display Code");
        Map<String, Object> block = Defs.displayBlock("q1", "Hello");
        block.put("code", "info1");
        ResponseEntity<Map<String, Object>> resp = putDraft(id, Defs.definitionWithQuestions(
                Defs.textQuestion("q2", "text1"), block));
        assertEquals(400, resp.getStatusCode().value());
        assertTrue(anyErrorContains(resp.getBody(), "must not have a code"));
    }

    @Test
    void displayBlockPublishesFineWithoutACode() {
        String id = questionnaire("Display OK");
        ResponseEntity<Map<String, Object>> resp = draftThenPublish(id, Defs.definitionWithQuestions(
                Defs.textQuestion("q1", "text1"),
                Defs.displayBlock("q2", "Some *display* text with a [link](https://example.com)")));
        assertEquals(200, resp.getStatusCode().value(), "display block without a code should publish: " + resp.getBody());
    }
}
