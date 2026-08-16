package io.formsengine.service;

import io.formsengine.domain.Questionnaire;
import io.formsengine.domain.QuestionnaireVersion;
import io.formsengine.domain.ResponseDocument;
import io.formsengine.repository.QuestionnaireRepository;
import io.formsengine.repository.QuestionnaireVersionRepository;
import io.formsengine.repository.ResponseRepository;
import io.formsengine.validation.DefinitionValidator;
import io.formsengine.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Public runtime operations: live definition, response lifecycle and input caps
 * (BRD 9.2, FR-B-4, FR-B-5, NFR-4, D-5, D-7; Phase 2 FR2-5; Phase 3 FR3-9;
 * Phase 5 FR5-1/2/6/7 external reference and submission policy).
 */
@Service
public class PublicResponseService {

    /** NFR-4 caps. */
    static final int MAX_ANSWER_KEYS = 500;
    static final int MAX_ANSWER_VALUE_BYTES = 10 * 1024;
    static final int MAX_ANSWERS_TOTAL_BYTES = 256 * 1024;

    /** FR2-5 shape caps. */
    static final int MAX_ARRAY_ELEMENTS = 100;
    static final int MAX_OBJECT_KEYS = 20;

    /** FR3-9: the exact key set of a file reference object (§4.2). */
    static final Set<String> FILE_REFERENCE_KEYS = Set.of("fileId", "fileName", "size", "contentType");

    /** FR5-1: external reference length cap, after trim. */
    static final int MAX_EXTERNAL_REF_LENGTH = 128;

    /** FR5-6: machine-readable code on the 409s the renderer branches on. */
    public static final String CODE_ALREADY_SUBMITTED = "ALREADY_SUBMITTED";

    private final QuestionnaireRepository questionnaires;
    private final QuestionnaireVersionRepository versions;
    private final ResponseRepository responses;
    private final MongoTemplate mongo;

    public PublicResponseService(QuestionnaireRepository questionnaires,
                                 QuestionnaireVersionRepository versions,
                                 ResponseRepository responses,
                                 MongoTemplate mongo) {
        this.questionnaires = questionnaires;
        this.versions = versions;
        this.responses = responses;
        this.mongo = mongo;
    }

    public Questionnaire getByPublicId(String publicId) {
        return questionnaires.findByPublicId(publicId)
                .orElseThrow(() -> ApiException.notFound("questionnaire not found"));
    }

    /** Lookup that tolerates deletion (responses are retained when a questionnaire is deleted). */
    public java.util.Optional<Questionnaire> findQuestionnaire(String publicId) {
        return questionnaires.findByPublicId(publicId);
    }

    /** Latest published version for the live endpoint; 404 if never published (FR-B-5). */
    public QuestionnaireVersion getLiveVersion(Questionnaire q) {
        if (q.getCurrentVersion() < 1) {
            throw ApiException.notFound("questionnaire has no published version");
        }
        return versions.findByQuestionnaireIdAndVersionNumber(q.getId(), q.getCurrentVersion())
                .orElseThrow(() -> ApiException.notFound("questionnaire has no published version"));
    }

    /**
     * Creates a response pinned to the requested published version
     * (FR-L-8/9, D-5, D-6). Phase 5: the external reference is captured at
     * creation and immutable thereafter (FR5-2, P5-D4); under ONE_PER_REF a
     * missing ref is a 400 and an existing COMPLETED same-ref response is a
     * 409 ALREADY_SUBMITTED (FR5-6a). IN_PROGRESS responses never block —
     * abandoned drafts must not lock a person out (P5-D2).
     */
    public ResponseDocument createResponse(Questionnaire q, Integer versionNumber, String externalRef,
                                           String origin, String userAgent) {
        if (versionNumber == null) {
            throw ApiException.badRequest("versionNumber is required");
        }
        if (versionNumber < 1 || versionNumber > q.getCurrentVersion()) {
            throw ApiException.badRequest("versionNumber " + versionNumber + " is not a published version of this questionnaire");
        }
        if (versions.findByQuestionnaireIdAndVersionNumber(q.getId(), versionNumber).isEmpty()) {
            throw ApiException.badRequest("versionNumber " + versionNumber + " is not a published version of this questionnaire");
        }
        String ref = normalizeExternalRef(externalRef);
        if (q.isOnePerRef()) {
            if (ref == null) {
                throw ApiException.badRequest(
                        "this questionnaire requires an external reference (submission policy ONE_PER_REF)");
            }
            if (responses.existsByQuestionnaireIdAndExternalRefAndStatus(
                    q.getId(), ref, ResponseDocument.STATUS_COMPLETED)) {
                throw ApiException.conflict(
                        "a completed response already exists for this reference", CODE_ALREADY_SUBMITTED);
            }
        }

        ResponseDocument r = new ResponseDocument();
        r.setResponseId(generateResponseId());
        r.setQuestionnaireId(q.getId());
        r.setPublicId(q.getPublicId());
        r.setVersionNumber(versionNumber);
        r.setStatus(ResponseDocument.STATUS_IN_PROGRESS);
        r.setExternalRef(ref);
        r.setAnswers(new LinkedHashMap<>());
        r.setMeta(new ResponseDocument.Meta(origin, userAgent));
        return responses.save(r);
    }

    /**
     * FR5-1: 1–{@value #MAX_EXTERNAL_REF_LENGTH} chars after trim, stored
     * verbatim, no format assumptions (a UUID, an email hash and a future
     * signed token must all fit). Absent/blank → null; over-long → 400.
     */
    static String normalizeExternalRef(String externalRef) {
        if (externalRef == null) {
            return null;
        }
        String ref = externalRef.trim();
        if (ref.isEmpty()) {
            return null;
        }
        if (ref.length() > MAX_EXTERNAL_REF_LENGTH) {
            throw ApiException.badRequest("externalRef is " + ref.length()
                    + " characters; the maximum is " + MAX_EXTERNAL_REF_LENGTH);
        }
        return ref;
    }

    public ResponseDocument getResponse(String responseId) {
        return responses.findByResponseId(responseId)
                .orElseThrow(() -> ApiException.notFound("response not found"));
    }

    /**
     * FR4-2: the version the response is pinned to, for rehydration. A missing
     * version (questionnaire deleted, which cascades to its versions) is a 404
     * — exactly the signal that safely resets a stale sessionStorage entry
     * (FR4-3).
     */
    public QuestionnaireVersion getPinnedVersion(ResponseDocument r) {
        return versions.findByQuestionnaireIdAndVersionNumber(r.getQuestionnaireId(), r.getVersionNumber())
                .orElseThrow(() -> ApiException.notFound("response's questionnaire version no longer exists"));
    }

    /**
     * Full-replace of the answers map plus lastPosition (FR-L-10, D-7).
     * Rejects completed responses with 409 and enforces NFR-4 caps; every
     * answer value must be a string, finite number, boolean, array of strings
     * or flat string-valued object (FR2-5). The backend still does not
     * validate values against the definition's types or constraints in
     * Phase 2 — caps and JSON-shape checks only.
     */
    public ResponseDocument patchResponse(String responseId, Map<String, Object> rawAnswers,
                                          String stepId, String tabId) {
        ResponseDocument r = getResponse(responseId);
        if (ResponseDocument.STATUS_COMPLETED.equals(r.getStatus())) {
            throw ApiException.conflict("response is already completed and can no longer be modified");
        }

        Map<String, Object> answers = validateAndConvertAnswers(rawAnswers);
        r.setAnswers(answers);
        if (stepId != null || tabId != null) {
            r.setLastPosition(new ResponseDocument.Position(stepId, tabId));
        }
        return responses.save(r);
    }

    /**
     * Idempotent completion (FR-L-11): completing twice returns the original
     * completedAt.
     *
     * <p>Phase 5 (FR5-6b/7): under ONE_PER_REF, completion is the scarce act.
     * The policy is read from the questionnaire's CURRENT setting — the server
     * is authoritative regardless of the session's pinned definition copy
     * (FR5-12). Enforcement is two-layered: an advisory pre-check against
     * existing COMPLETED same-ref responses (covers responses completed before
     * the policy flipped, which carry no completion key), then an atomic
     * status transition that writes {@code completionKey} under its sparse
     * unique index — first completion wins a concurrent race, the loser's
     * duplicate-key failure surfaces as 409 ALREADY_SUBMITTED. Never a
     * check-then-act read alone.
     */
    public ResponseDocument complete(String responseId) {
        ResponseDocument r = getResponse(responseId);
        if (ResponseDocument.STATUS_COMPLETED.equals(r.getStatus())) {
            return r;
        }
        boolean onePerRef = r.getExternalRef() != null && questionnaires.findByPublicId(r.getPublicId())
                .filter(q -> q.getId().equals(r.getQuestionnaireId()))
                .map(Questionnaire::isOnePerRef)
                .orElse(false);
        if (!onePerRef) {
            r.setStatus(ResponseDocument.STATUS_COMPLETED);
            r.setCompletedAt(Instant.now());
            return responses.save(r);
        }
        if (responses.existsByQuestionnaireIdAndExternalRefAndStatus(
                r.getQuestionnaireId(), r.getExternalRef(), ResponseDocument.STATUS_COMPLETED)) {
            throw ApiException.conflict(
                    "a completed response already exists for this reference", CODE_ALREADY_SUBMITTED);
        }
        Query query = Query.query(Criteria.where("responseId").is(responseId)
                .and("status").is(ResponseDocument.STATUS_IN_PROGRESS));
        Instant now = Instant.now();
        Update update = new Update()
                .set("status", ResponseDocument.STATUS_COMPLETED)
                .set("completedAt", now)
                // findAndModify bypasses Spring auditing; keep updatedAt honest.
                .set("updatedAt", now)
                .set("completionKey", r.getQuestionnaireId().toHexString() + "|" + r.getExternalRef());
        try {
            ResponseDocument completed = mongo.findAndModify(query, update,
                    FindAndModifyOptions.options().returnNew(true), ResponseDocument.class);
            // null = the guarded query matched nothing, i.e. this same response
            // completed concurrently — the idempotent case, not a conflict.
            return completed != null ? completed : getResponse(responseId);
        } catch (DuplicateKeyException race) {
            throw ApiException.conflict(
                    "a completed response already exists for this reference", CODE_ALREADY_SUBMITTED);
        }
    }

    private static Map<String, Object> validateAndConvertAnswers(Map<String, Object> rawAnswers) {
        Map<String, Object> input = rawAnswers == null ? Map.of() : rawAnswers;
        List<String> problems = new ArrayList<>();

        if (input.size() > MAX_ANSWER_KEYS) {
            problems.add("answers map has " + input.size() + " keys; the maximum is " + MAX_ANSWER_KEYS);
        }

        Map<String, Object> answers = new LinkedHashMap<>();
        long totalBytes = 0;
        for (Map.Entry<String, Object> entry : input.entrySet()) {
            String key = entry.getKey();
            if (key == null || !DefinitionValidator.CODE_PATTERN.matcher(key).matches()) {
                problems.add("answer key '" + key
                        + "' is invalid — keys must start with a letter and contain only letters, digits, '_' or '-' (max 64 chars)");
                continue;
            }
            Object value = entry.getValue();
            int valueBytes = measureAnswerValue(key, value, problems);
            if (valueBytes < 0) {
                continue;
            }
            if (valueBytes > MAX_ANSWER_VALUE_BYTES) {
                problems.add("answer '" + key + "' is " + valueBytes + " bytes; the maximum per answer is "
                        + MAX_ANSWER_VALUE_BYTES + " bytes (10 KB)");
                continue;
            }
            totalBytes += valueBytes;
            totalBytes += key.getBytes(StandardCharsets.UTF_8).length;
            answers.put(key, value);
        }
        if (totalBytes > MAX_ANSWERS_TOTAL_BYTES) {
            problems.add("answers map totals " + totalBytes + " bytes; the maximum is "
                    + MAX_ANSWERS_TOTAL_BYTES + " bytes (256 KB)");
        }
        if (!problems.isEmpty()) {
            throw ApiException.badRequest("invalid answers", problems);
        }
        return answers;
    }

    /**
     * FR2-5 (extended by FR3-9): validates one answer value's JSON shape and
     * returns its approximate serialized size in bytes, or {@code -1} (with a
     * problem recorded) when the shape is invalid. Legal shapes: string,
     * finite number, boolean, array of strings or of file reference objects
     * (≤ {@value #MAX_ARRAY_ELEMENTS} elements, never mixed), flat object
     * with string keys and string values (≤ {@value #MAX_OBJECT_KEYS} keys).
     */
    private static int measureAnswerValue(String key, Object value, List<String> problems) {
        if (value == null) {
            problems.add("answer '" + key + "' must not be null — omit the key to clear an answer");
            return -1;
        }
        if (value instanceof String s) {
            return s.getBytes(StandardCharsets.UTF_8).length;
        }
        if (value instanceof Boolean) {
            return 5;
        }
        if (value instanceof Number n) {
            double d = n.doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) {
                problems.add("answer '" + key + "' must be a finite number");
                return -1;
            }
            return n.toString().getBytes(StandardCharsets.UTF_8).length;
        }
        if (value instanceof List<?> list) {
            if (list.size() > MAX_ARRAY_ELEMENTS) {
                problems.add("answer '" + key + "' has " + list.size() + " elements; the maximum per array is "
                        + MAX_ARRAY_ELEMENTS);
                return -1;
            }
            return measureAnswerArray(key, list, problems);
        }
        if (value instanceof Map<?, ?> map) {
            if (map.size() > MAX_OBJECT_KEYS) {
                problems.add("answer '" + key + "' has " + map.size() + " keys; the maximum per object is "
                        + MAX_OBJECT_KEYS);
                return -1;
            }
            int bytes = 0;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!(entry.getKey() instanceof String k)) {
                    problems.add("answer '" + key + "' must be a flat object with string keys");
                    return -1;
                }
                if (!(entry.getValue() instanceof String v)) {
                    problems.add("answer '" + key + "' must be a flat object with string values — key '" + k
                            + "' has a non-string value");
                    return -1;
                }
                bytes += k.getBytes(StandardCharsets.UTF_8).length + v.getBytes(StandardCharsets.UTF_8).length;
            }
            return bytes;
        }
        problems.add("answer '" + key
                + "' must be a string, number, boolean, array of strings, array of file references, or a flat object with string values");
        return -1;
    }

    /**
     * FR3-9 (amends FR2-5): an answer array is either an array of strings or
     * an array of file reference objects — never a mix within one array.
     */
    private static int measureAnswerArray(String key, List<?> list, List<String> problems) {
        int bytes = 0;
        int index = 0;
        Boolean fileReferences = null;
        for (Object element : list) {
            boolean isString = element instanceof String;
            boolean isMap = element instanceof Map;
            if (!isString && !isMap) {
                problems.add("answer '" + key
                        + "' must be an array of strings or an array of file reference objects — element at index "
                        + index + " is neither");
                return -1;
            }
            if (fileReferences == null) {
                fileReferences = isMap;
            } else if (fileReferences != isMap) {
                problems.add("answer '" + key
                        + "' must not mix strings and file reference objects within one array");
                return -1;
            }
            if (isString) {
                bytes += ((String) element).getBytes(StandardCharsets.UTF_8).length;
            } else {
                int referenceBytes = measureFileReference(key, index, (Map<?, ?>) element, problems);
                if (referenceBytes < 0) {
                    return -1;
                }
                bytes += referenceBytes;
            }
            index++;
        }
        return bytes;
    }

    /**
     * FR3-9: one file reference object (§4.2) — exactly the keys fileId,
     * fileName, size and contentType, with string fileId/fileName/contentType
     * and a finite numeric size.
     */
    private static int measureFileReference(String key, int index, Map<?, ?> map, List<String> problems) {
        if (!FILE_REFERENCE_KEYS.equals(map.keySet())) {
            problems.add("answer '" + key + "' element at index " + index
                    + " must be a file reference object with exactly the keys fileId, fileName, size and contentType");
            return -1;
        }
        int bytes = 0;
        for (String field : List.of("fileId", "fileName", "contentType")) {
            if (!(map.get(field) instanceof String s)) {
                problems.add("answer '" + key + "' element at index " + index
                        + " must have a string '" + field + "'");
                return -1;
            }
            bytes += field.getBytes(StandardCharsets.UTF_8).length + s.getBytes(StandardCharsets.UTF_8).length;
        }
        Object size = map.get("size");
        if (!(size instanceof Number n) || Double.isNaN(n.doubleValue()) || Double.isInfinite(n.doubleValue())) {
            problems.add("answer '" + key + "' element at index " + index
                    + " must have a finite numeric 'size'");
            return -1;
        }
        bytes += "size".getBytes(StandardCharsets.UTF_8).length + n.toString().getBytes(StandardCharsets.UTF_8).length;
        return bytes;
    }

    /**
     * FR5-8/9/10: has this (questionnaire, ref) completed? Returns only
     * {@code NONE} or {@code COMPLETED} — never a responseId, never answers,
     * never an in-progress signal (P5-D1: refs are frequently guessable and a
     * responseId is the session credential that unlocks answers via the
     * Phase-4 rehydration endpoint). Nonexistent questionnaires, unknown refs,
     * over-long refs and in-progress-only refs all answer identically:
     * {@code NONE}.
     */
    public String refStatus(String publicId, String externalRef) {
        String ref = externalRef == null ? "" : externalRef.trim();
        if (ref.isEmpty() || ref.length() > MAX_EXTERNAL_REF_LENGTH) {
            return "NONE";
        }
        boolean completed = questionnaires.findByPublicId(publicId)
                .map(q -> responses.existsByQuestionnaireIdAndExternalRefAndStatus(
                        q.getId(), ref, ResponseDocument.STATUS_COMPLETED))
                .orElse(false);
        return completed ? "COMPLETED" : "NONE";
    }

    /** FR-B-4: unguessable public handle, "r_" + UUIDv4 without dashes. */
    private static String generateResponseId() {
        return "r_" + UUID.randomUUID().toString().replace("-", "");
    }
}
