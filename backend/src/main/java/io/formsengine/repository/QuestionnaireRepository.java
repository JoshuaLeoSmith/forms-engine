package io.formsengine.repository;

import io.formsengine.domain.Questionnaire;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

/** Repository for the {@code questionnaires} collection (BRD 10). */
public interface QuestionnaireRepository extends MongoRepository<Questionnaire, ObjectId> {

    Optional<Questionnaire> findByPublicId(String publicId);

    Page<Questionnaire> findAllBy(Pageable pageable);

    /** Import name-collision check (Phase 4 FR4-12). */
    boolean existsByName(String name);
}
