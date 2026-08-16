package io.formsengine.repository;

import io.formsengine.domain.UploadedFileDocument;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Repository for the {@code uploaded_files} collection (Phase 3 §3). */
public interface UploadedFileRepository extends MongoRepository<UploadedFileDocument, ObjectId> {

    Optional<UploadedFileDocument> findByFileId(String fileId);

    List<UploadedFileDocument> findByResponseIdAndStatus(String responseId, String status);

    /** Cleanup-job candidate scan over the {@code (status, createdAt)} index (FR3-12). */
    List<UploadedFileDocument> findByStatusAndCreatedAtBefore(String status, Instant cutoff);

    /** FR3-13 deletion-dialog stats: every ACTIVE file of a questionnaire. */
    List<UploadedFileDocument> findByQuestionnaireIdAndStatus(ObjectId questionnaireId, String status);
}
