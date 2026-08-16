package io.formsengine.repository;

import io.formsengine.domain.QuestionnaireVersion;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

/** Repository for the append-only {@code questionnaire_versions} collection (BRD 10). */
public interface QuestionnaireVersionRepository extends MongoRepository<QuestionnaireVersion, ObjectId> {

    List<QuestionnaireVersion> findByQuestionnaireIdOrderByVersionNumberDesc(ObjectId questionnaireId);

    Optional<QuestionnaireVersion> findByQuestionnaireIdAndVersionNumber(ObjectId questionnaireId, int versionNumber);

    void deleteByQuestionnaireId(ObjectId questionnaireId);
}
