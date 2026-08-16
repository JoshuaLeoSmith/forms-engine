package io.formsengine.definition;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

/**
 * A tab: second hierarchy level (BRD 5.1). Contains questions.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Tab {

    private String id;
    private String title;
    private RuleConfig visibility;
    private RuleConfig requirement;
    private List<Question> questions = new ArrayList<>();

    public Tab() {
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

    public List<Question> getQuestions() {
        return questions;
    }

    public void setQuestions(List<Question> questions) {
        this.questions = questions == null ? new ArrayList<>() : questions;
    }
}
