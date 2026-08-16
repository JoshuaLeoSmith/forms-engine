package io.formsengine.domain;

import io.formsengine.definition.Definition;
import org.bson.types.ObjectId;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * The questionnaire document: mutable draft plus publish metadata (BRD 10).
 * {@code currentVersion} = 0 means never published. {@code draftHash} /
 * {@code liveHash} are SHA-256 hex hashes of the canonical definition JSON,
 * used for the unpublished-changes indicator (FR-E-3).
 */
@Document("questionnaires")
public class Questionnaire {

    /** FR5-4: repeat submissions allowed — exactly the pre-Phase-5 behavior. Default. */
    public static final String POLICY_MULTIPLE = "MULTIPLE";
    /** FR5-4: one COMPLETED response per external reference (honor-system dedup). */
    public static final String POLICY_ONE_PER_REF = "ONE_PER_REF";

    @Id
    private ObjectId id;

    @Indexed(unique = true)
    private String publicId;

    private String name;

    private List<String> allowedOrigins = new ArrayList<>();

    /**
     * FR5-4: per-questionnaire submission policy. Read at the questionnaire
     * (live) level — the server is authoritative at create/complete time
     * regardless of what any pinned definition copy says (FR5-12). Null in
     * pre-Phase-5 documents; treat as MULTIPLE.
     */
    private String submissionPolicy = POLICY_MULTIPLE;

    private Definition draft;

    private String draftHash;

    private String liveHash;

    private int currentVersion;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public Questionnaire() {
    }

    public ObjectId getId() {
        return id;
    }

    public void setId(ObjectId id) {
        this.id = id;
    }

    public String getPublicId() {
        return publicId;
    }

    public void setPublicId(String publicId) {
        this.publicId = publicId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<String> getAllowedOrigins() {
        return allowedOrigins;
    }

    public void setAllowedOrigins(List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins == null ? new ArrayList<>() : allowedOrigins;
    }

    /** Never null: pre-Phase-5 documents without the field read as MULTIPLE. */
    public String getSubmissionPolicy() {
        return submissionPolicy == null ? POLICY_MULTIPLE : submissionPolicy;
    }

    public void setSubmissionPolicy(String submissionPolicy) {
        this.submissionPolicy = submissionPolicy;
    }

    public boolean isOnePerRef() {
        return POLICY_ONE_PER_REF.equals(getSubmissionPolicy());
    }

    public Definition getDraft() {
        return draft;
    }

    public void setDraft(Definition draft) {
        this.draft = draft;
    }

    public String getDraftHash() {
        return draftHash;
    }

    public void setDraftHash(String draftHash) {
        this.draftHash = draftHash;
    }

    public String getLiveHash() {
        return liveHash;
    }

    public void setLiveHash(String liveHash) {
        this.liveHash = liveHash;
    }

    public int getCurrentVersion() {
        return currentVersion;
    }

    public void setCurrentVersion(int currentVersion) {
        this.currentVersion = currentVersion;
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

    /** FR-E-3: unpublished when never published, or when draft hash differs from live hash. */
    public boolean hasUnpublishedChanges() {
        if (currentVersion == 0) {
            return true;
        }
        return draftHash == null || !draftHash.equals(liveHash);
    }
}
