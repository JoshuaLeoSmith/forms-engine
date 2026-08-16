package io.formsengine.definition;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One rule condition (BRD 6.1, Phase 2 §4.1). {@code source} is QUESTION in v1;
 * the discriminator exists so EXTERNAL sources can be added later without schema
 * migration. {@code operator} is an open string enum (Phase 2 adds CONTAINS,
 * NOT_CONTAINS, GREATER_THAN, LESS_THAN, BEFORE, AFTER). {@code subField} is
 * only valid when the referenced question is ADDRESS (FR2-6); {@code value} is
 * typed — string, number or boolean, matching the referenced question (FR2-7).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Condition {

    private String source;
    private String questionCode;
    private String subField;
    private String operator;
    private Object value;

    public Condition() {
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getQuestionCode() {
        return questionCode;
    }

    public void setQuestionCode(String questionCode) {
        this.questionCode = questionCode;
    }

    public String getSubField() {
        return subField;
    }

    public void setSubField(String subField) {
        this.subField = subField;
    }

    public String getOperator() {
        return operator;
    }

    public void setOperator(String operator) {
        this.operator = operator;
    }

    public Object getValue() {
        return value;
    }

    public void setValue(Object value) {
        this.value = value;
    }
}
