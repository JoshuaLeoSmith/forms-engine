package io.formsengine.definition;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Visibility or requirement configuration on a step, tab or question (BRD 6.2, 6.4).
 * {@code mode} is one of ALWAYS | CONDITIONAL | NEVER; {@code rule} is present when
 * mode is CONDITIONAL.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RuleConfig {

    private String mode;
    private Rule rule;

    public RuleConfig() {
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public Rule getRule() {
        return rule;
    }

    public void setRule(Rule rule) {
        this.rule = rule;
    }
}
