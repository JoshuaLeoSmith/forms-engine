package io.formsengine.service;

import io.formsengine.domain.ResponseDocument;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Stream;

/**
 * Filtered reads over the {@code responses} collection for the responses
 * browser (FR4-10) and CSV export (FR4-15). Phase 5 (FR5-3) adds the
 * {@code externalRef} filter to both, which made the derived-query-per-filter-
 * combination approach untenable — one Criteria builder replaces it.
 */
@Service
public class ResponseQueryService {

    private final MongoTemplate mongo;

    public ResponseQueryService(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    /** Browser page, newest first; null/blank filters are skipped. */
    public Page<ResponseDocument> page(ObjectId questionnaireId, String status, Integer versionNumber,
                                       String externalRef, Pageable pageable) {
        Query query = Query.query(criteria(questionnaireId, status, versionNumber, externalRef));
        long total = mongo.count(query, ResponseDocument.class);
        List<ResponseDocument> items = mongo.find(query.with(pageable), ResponseDocument.class);
        return new PageImpl<>(items, pageable, total);
    }

    /** CSV export rows, newest first, lazily streamed (the caller closes the stream). */
    public Stream<ResponseDocument> stream(ObjectId questionnaireId, String status, int versionNumber,
                                           String externalRef) {
        Query query = Query.query(criteria(questionnaireId, status, versionNumber, externalRef))
                .with(Sort.by(Sort.Direction.DESC, "createdAt"));
        return mongo.stream(query, ResponseDocument.class);
    }

    private static Criteria criteria(ObjectId questionnaireId, String status, Integer versionNumber,
                                     String externalRef) {
        Criteria criteria = Criteria.where("questionnaireId").is(questionnaireId);
        if (status != null && !status.isBlank()) {
            criteria = criteria.and("status").is(status);
        }
        if (versionNumber != null) {
            criteria = criteria.and("versionNumber").is(versionNumber);
        }
        if (externalRef != null && !externalRef.isBlank()) {
            criteria = criteria.and("externalRef").is(externalRef);
        }
        return criteria;
    }
}
