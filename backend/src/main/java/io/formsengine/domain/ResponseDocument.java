package io.formsengine.domain;

import org.bson.types.ObjectId;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * A respondent's answer document, pinned to the version they started on
 * (BRD 10, FR-B-5, D-5). {@code responseId} is the public, unguessable handle
 * (FR-B-4); the Mongo {@code _id} is never exposed. Answer values are typed
 * as of Phase 2 (§3): string, number, boolean, array of strings, or a flat
 * string-valued object.
 *
 * <p>Phase 5 (FR5-2): {@code externalRef} is the host application's opaque
 * identity label, captured at creation and immutable thereafter (P5-D4). It is
 * correlation data, not a credential — spoofable by design, per the Phase-5
 * posture.
 */
@Document("responses")
@CompoundIndex(name = "questionnaire_status_created", def = "{'questionnaireId': 1, 'status': 1, 'createdAt': -1}")
@CompoundIndex(name = "questionnaire_ref_status", def = "{'questionnaireId': 1, 'externalRef': 1, 'status': 1}")
public class ResponseDocument {

    public static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    public static final String STATUS_COMPLETED = "COMPLETED";

    @Id
    private ObjectId id;

    @Indexed(unique = true)
    private String responseId;

    private ObjectId questionnaireId;

    private String publicId;

    private int versionNumber;

    private String status;

    private String externalRef;

    /**
     * FR5-7: the database-level completion guard. Set to
     * {@code questionnaireId|externalRef} atomically with the transition to
     * COMPLETED, but only when the questionnaire's policy is ONE_PER_REF at
     * completion time — a sparse unique index on this field makes the first
     * completion win a concurrent race and the loser fail with a duplicate
     * key. Never exposed through any API.
     */
    @Indexed(unique = true, sparse = true)
    private String completionKey;

    private Map<String, Object> answers = new HashMap<>();

    private Position lastPosition;

    private Meta meta;

    private Instant completedAt;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public ResponseDocument() {
    }

    public ObjectId getId() {
        return id;
    }

    public void setId(ObjectId id) {
        this.id = id;
    }

    public String getResponseId() {
        return responseId;
    }

    public void setResponseId(String responseId) {
        this.responseId = responseId;
    }

    public ObjectId getQuestionnaireId() {
        return questionnaireId;
    }

    public void setQuestionnaireId(ObjectId questionnaireId) {
        this.questionnaireId = questionnaireId;
    }

    public String getPublicId() {
        return publicId;
    }

    public void setPublicId(String publicId) {
        this.publicId = publicId;
    }

    public int getVersionNumber() {
        return versionNumber;
    }

    public void setVersionNumber(int versionNumber) {
        this.versionNumber = versionNumber;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getExternalRef() {
        return externalRef;
    }

    public void setExternalRef(String externalRef) {
        this.externalRef = externalRef;
    }

    public String getCompletionKey() {
        return completionKey;
    }

    public void setCompletionKey(String completionKey) {
        this.completionKey = completionKey;
    }

    public Map<String, Object> getAnswers() {
        return answers;
    }

    public void setAnswers(Map<String, Object> answers) {
        this.answers = answers == null ? new HashMap<>() : answers;
    }

    public Position getLastPosition() {
        return lastPosition;
    }

    public void setLastPosition(Position lastPosition) {
        this.lastPosition = lastPosition;
    }

    public Meta getMeta() {
        return meta;
    }

    public void setMeta(Meta meta) {
        this.meta = meta;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
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

    /** {@code lastPosition} sub-document: where the respondent last was (FR-L-10). */
    public static class Position {
        private String stepId;
        private String tabId;

        public Position() {
        }

        public Position(String stepId, String tabId) {
            this.stepId = stepId;
            this.tabId = tabId;
        }

        public String getStepId() {
            return stepId;
        }

        public void setStepId(String stepId) {
            this.stepId = stepId;
        }

        public String getTabId() {
            return tabId;
        }

        public void setTabId(String tabId) {
            this.tabId = tabId;
        }
    }

    /** {@code meta} sub-document: basic forensics (FR-B-3). */
    public static class Meta {
        private String origin;
        private String userAgent;

        public Meta() {
        }

        public Meta(String origin, String userAgent) {
            this.origin = origin;
            this.userAgent = userAgent;
        }

        public String getOrigin() {
            return origin;
        }

        public void setOrigin(String origin) {
            this.origin = origin;
        }

        public String getUserAgent() {
            return userAgent;
        }

        public void setUserAgent(String userAgent) {
            this.userAgent = userAgent;
        }
    }
}
