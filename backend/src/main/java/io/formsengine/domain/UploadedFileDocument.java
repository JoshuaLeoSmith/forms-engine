package io.formsengine.domain;

import org.bson.types.ObjectId;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * One uploaded file's metadata — the source of truth for what exists in
 * storage; storage itself is never listed (Phase 3 §3). {@code fileId} is the
 * public, unguessable handle (FR3-7); the storage key never appears in any API
 * response (FR3-23). {@code contentType} is the verified type (FR3-21), never
 * the client's claim; {@code fileName} is the sanitized original name
 * (FR3-24), display/download only. {@code DELETED} rows are tombstones kept
 * after storage removal for audit/debugging.
 */
@Document("uploaded_files")
@CompoundIndex(name = "response_status", def = "{'responseId': 1, 'status': 1}")
@CompoundIndex(name = "status_created", def = "{'status': 1, 'createdAt': 1}")
public class UploadedFileDocument {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_DELETED = "DELETED";

    @Id
    private ObjectId id;

    @Indexed(unique = true)
    private String fileId;

    private ObjectId questionnaireId;

    private String responseId;

    /** Question code at upload time (snapshot; not maintained across renames). */
    private String questionCode;

    private String storageKey;

    private String fileName;

    /** Bytes, as stored. */
    private long size;

    private String contentType;

    private String status;

    @CreatedDate
    private Instant createdAt;

    private Instant deletedAt;

    public UploadedFileDocument() {
    }

    public ObjectId getId() {
        return id;
    }

    public void setId(ObjectId id) {
        this.id = id;
    }

    public String getFileId() {
        return fileId;
    }

    public void setFileId(String fileId) {
        this.fileId = fileId;
    }

    public ObjectId getQuestionnaireId() {
        return questionnaireId;
    }

    public void setQuestionnaireId(ObjectId questionnaireId) {
        this.questionnaireId = questionnaireId;
    }

    public String getResponseId() {
        return responseId;
    }

    public void setResponseId(String responseId) {
        this.responseId = responseId;
    }

    public String getQuestionCode() {
        return questionCode;
    }

    public void setQuestionCode(String questionCode) {
        this.questionCode = questionCode;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public void setStorageKey(String storageKey) {
        this.storageKey = storageKey;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public long getSize() {
        return size;
    }

    public void setSize(long size) {
        this.size = size;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public void setDeletedAt(Instant deletedAt) {
        this.deletedAt = deletedAt;
    }
}
