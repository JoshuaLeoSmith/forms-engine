package io.formsengine.definition;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

/**
 * A step: top hierarchy level (BRD 5.1). Contains either tabs or questions,
 * never both (validated at save time, FR-B-1).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Step {

    private String id;
    private String title;
    private RuleConfig visibility;
    private RuleConfig requirement;
    private List<Tab> tabs = new ArrayList<>();
    private List<Question> questions = new ArrayList<>();

    public Step() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public RuleConfig getVisibility() {
        return visibility;
    }

    public void setVisibility(RuleConfig visibility) {
        this.visibility = visibility;
    }

    public RuleConfig getRequirement() {
        return requirement;
    }

    public void setRequirement(RuleConfig requirement) {
        this.requirement = requirement;
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
}
