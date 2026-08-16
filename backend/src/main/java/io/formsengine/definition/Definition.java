package io.formsengine.definition;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

/**
 * Root of the questionnaire definition JSON contract (BRD 5.2).
 *
 * <p>Exactly one of {@code steps}, {@code tabs} or {@code questions} may be non-empty
 * (BRD 5.1); the backend validates this in {@code DefinitionValidator} (FR-B-1).
 * Lists default to empty and are never {@code null}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Definition {

    private int schemaVersion;
    private List<Step> steps = new ArrayList<>();
    private List<Tab> tabs = new ArrayList<>();
    private List<Question> questions = new ArrayList<>();

    public Definition() {
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public List<Step> getSteps() {
        return steps;
    }

    public void setSteps(List<Step> steps) {
        this.steps = steps == null ? new ArrayList<>() : steps;
    }

    public List<Tab> getTabs() {
        return tabs;
    }

    public void setTabs(List<Tab> tabs) {
        this.tabs = tabs == null ? new ArrayList<>() : tabs;
    }

    public List<Question> getQuestions() {
        return questions;
    }

    public void setQuestions(List<Question> questions) {
        this.questions = questions == null ? new ArrayList<>() : questions;
    }

    /** Creates the empty draft definition given to a freshly created questionnaire. */
    public static Definition empty() {
        Definition d = new Definition();
        d.setSchemaVersion(1);
        return d;
    }
}
