package io.formsengine.definition;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

/**
 * A boolean rule: combinator (ALL = AND, ANY = OR) over a flat list of
 * conditions (BRD 6.1). No nested groups in v1.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Rule {

    private String combinator;
    private List<Condition> conditions = new ArrayList<>();

    public Rule() {
    }

    public String getCombinator() {
        return combinator;
    }

    public void setCombinator(String combinator) {
        this.combinator = combinator;
    }

    public List<Condition> getConditions() {
        return conditions;
    }

    public void setConditions(List<Condition> conditions) {
        this.conditions = conditions == null ? new ArrayList<>() : conditions;
    }
}
