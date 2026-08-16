package io.formsengine.repository;

import io.formsengine.domain.ResponseDocument;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

/**
 * Repository for the {@code responses} collection (BRD 10). Browse/export
 * filtering lives in {@link io.formsengine.service.ResponseQueryService} —
 * the status × version × externalRef filter matrix outgrew derived queries
 * in Phase 5.
 */
public interface ResponseRepository extends MongoRepository<ResponseDocument, ObjectId> {

    Optional<ResponseDocument> findByResponseId(String responseId);

    long countByQuestionnaireId(ObjectId questionnaireId);

    /**
     * FR5-6/FR5-8: is there a COMPLETED response for this (questionnaire,
     * externalRef)? Backed by the {@code questionnaire_ref_status} index
     * (FR5-2). Advisory for the create-time and complete-time pre-checks; the
     * race-safe guard is the sparse unique {@code completionKey} index.
     */
    boolean existsByQuestionnaireIdAndExternalRefAndStatus(ObjectId questionnaireId, String externalRef, String status);
}
