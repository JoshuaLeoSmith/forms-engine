package io.formsengine.definition;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

/**
 * A question: fourth hierarchy level, the actual intake field (BRD 5.2, 5.3).
 * The {@code code} is the developer-facing key used in answers JSON and rule
 * conditions; {@code typeConfig} is the per-type payload validated by the
 * {@code QuestionTypeRegistry} (BRD 5.4, NFR-6).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Question {

    private String id;
    private String code;
    private String sectionTitle;
    private String prompt;
    private String type;
    private String width;
    private Map<String, Object> typeConfig;
    private RuleConfig visibility;
    private RuleConfig requirement;

    public Question() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getSectionTitle() {
        return sectionTitle;
    }

    public void setSectionTitle(String sectionTitle) {
        this.sectionTitle = sectionTitle;
    }

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getWidth() {
        return width;
    }

    public void setWidth(String width) {
        this.width = width;
    }

    public Map<String, Object> getTypeConfig() {
        return typeConfig;
    }

    public void setTypeConfig(Map<String, Object> typeConfig) {
        this.typeConfig = typeConfig;
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
}
