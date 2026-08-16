package io.formsengine.domain;

import io.formsengine.definition.Definition;
import org.bson.types.ObjectId;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * An immutable, append-only published snapshot of a definition (BRD 10, FR-E-16).
 * Unique per (questionnaireId, versionNumber).
 */
@Document("questionnaire_versions")
@CompoundIndex(name = "questionnaire_version_unique", def = "{'questionnaireId': 1, 'versionNumber': 1}", unique = true)
public class QuestionnaireVersion {

    @Id
    private ObjectId id;

    private ObjectId questionnaireId;

    private int versionNumber;

    private Definition definition;

    private String note;

    private Instant publishedAt;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public QuestionnaireVersion() {
    }

    public ObjectId getId() {
        return id;
    }

    public void setId(ObjectId id) {
        this.id = id;
    }

    public ObjectId getQuestionnaireId() {
        return questionnaireId;
    }

    public void setQuestionnaireId(ObjectId questionnaireId) {
        this.questionnaireId = questionnaireId;
    }

    public int getVersionNumber() {
        return versionNumber;
    }

    public void setVersionNumber(int versionNumber) {
        this.versionNumber = versionNumber;
    }

    public Definition getDefinition() {
        return definition;
    }

    public void setDefinition(Definition definition) {
        this.definition = definition;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public void setPublishedAt(Instant publishedAt) {
        this.publishedAt = publishedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
