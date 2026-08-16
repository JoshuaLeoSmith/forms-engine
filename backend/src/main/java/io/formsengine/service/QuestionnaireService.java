package io.formsengine.service;

import io.formsengine.definition.Definition;
import io.formsengine.domain.Questionnaire;
import io.formsengine.domain.QuestionnaireVersion;
import io.formsengine.domain.ResponseDocument;
import io.formsengine.repository.QuestionnaireRepository;
import io.formsengine.repository.QuestionnaireVersionRepository;
import io.formsengine.repository.ResponseRepository;
import io.formsengine.validation.DefinitionValidator;
import io.formsengine.web.ApiException;
import io.formsengine.web.dto.ManagementDtos.QuestionnaireImportRequest;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Management operations on questionnaires: draft editing, publishing, version
 * history, duplication and settings (BRD 9.1, FR-B-1, FR-E-16, FR-E-18).
 */
@Service
public class QuestionnaireService {

    /** NFR-4: serialized definition cap, 1 MB. */
    static final int MAX_DEFINITION_BYTES = 1024 * 1024;

    /** FR4-11: the export-envelope version, independent of schemaVersion. */
    public static final int EXPORT_VERSION = 1;

    private static final String PUBLIC_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final int PUBLIC_ID_LENGTH = 10;

    private final QuestionnaireRepository questionnaires;
    private final QuestionnaireVersionRepository versions;
    private final ResponseRepository responses;
    private final DefinitionValidator validator;
    private final CanonicalJsonService canonicalJson;
    private final FileService fileService;
    private final SecureRandom random = new SecureRandom();

    public QuestionnaireService(QuestionnaireRepository questionnaires,
                                QuestionnaireVersionRepository versions,
                                ResponseRepository responses,
                                DefinitionValidator validator,
                                CanonicalJsonService canonicalJson,
                                FileService fileService) {
        this.questionnaires = questionnaires;
        this.versions = versions;
        this.responses = responses;
        this.validator = validator;
        this.canonicalJson = canonicalJson;
        this.fileService = fileService;
    }

    public Page<Questionnaire> list(int page, int size) {
        return questionnaires.findAllBy(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "updatedAt")));
    }

    public long responseCount(ObjectId questionnaireId) {
        return responses.countByQuestionnaireId(questionnaireId);
    }

    public Questionnaire create(String name) {
        Questionnaire q = new Questionnaire();
        q.setPublicId(generatePublicId());
        q.setName(name);
        Definition empty = Definition.empty();
        q.setDraft(empty);
        q.setDraftHash(canonicalJson.sha256Hex(empty));
        q.setCurrentVersion(0);
        return questionnaires.save(q);
    }

    public Questionnaire get(String id) {
        return questionnaires.findById(parseId(id))
                .orElseThrow(() -> ApiException.notFound("questionnaire not found"));
    }

    /** PUT /draft — lenient validation, then replace the draft (FR-E-15). */
    public Questionnaire updateDraft(String id, Definition definition) {
        Questionnaire q = get(id);
        requireWithinSizeCap(definition);
        List<String> problems = validator.validateDraft(definition);
        if (!problems.isEmpty()) {
            throw ApiException.badRequest("draft validation failed", problems);
        }
        q.setDraft(definition);
        q.setDraftHash(canonicalJson.sha256Hex(definition));
        return questionnaires.save(q);
    }

    /** POST /publish — strict validation, snapshot version n+1, set live (FR-E-16). */
    public Questionnaire publish(String id, String note) {
        Questionnaire q = get(id);
        Definition draft = q.getDraft() == null ? Definition.empty() : q.getDraft();
        requireWithinSizeCap(draft);
        List<String> problems = validator.validatePublish(draft);
        if (!problems.isEmpty()) {
            throw ApiException.badRequest("publish validation failed", problems);
        }

        int nextVersion = q.getCurrentVersion() + 1;
        QuestionnaireVersion version = new QuestionnaireVersion();
        version.setQuestionnaireId(q.getId());
        version.setVersionNumber(nextVersion);
        version.setDefinition(draft);
        version.setNote(note);
        version.setPublishedAt(Instant.now());
        versions.save(version);

        String hash = canonicalJson.sha256Hex(draft);
        q.setCurrentVersion(nextVersion);
        q.setLiveHash(hash);
        q.setDraftHash(hash);
        return questionnaires.save(q);
    }

    public List<QuestionnaireVersion> listVersions(String id) {
        Questionnaire q = get(id);
        return versions.findByQuestionnaireIdOrderByVersionNumberDesc(q.getId());
    }

    public QuestionnaireVersion getVersion(String id, int versionNumber) {
        Questionnaire q = get(id);
        return versions.findByQuestionnaireIdAndVersionNumber(q.getId(), versionNumber)
                .orElseThrow(() -> ApiException.notFound("version " + versionNumber + " not found"));
    }

    /** POST /versions/{n}/restore — copy the version definition into the draft (FR-E-18). */
    public Questionnaire restore(String id, int versionNumber) {
        Questionnaire q = get(id);
        QuestionnaireVersion version = versions.findByQuestionnaireIdAndVersionNumber(q.getId(), versionNumber)
                .orElseThrow(() -> ApiException.notFound("version " + versionNumber + " not found"));
        q.setDraft(version.getDefinition());
        q.setDraftHash(canonicalJson.sha256Hex(version.getDefinition()));
        return questionnaires.save(q);
    }

    /** POST /duplicate — new publicId, copied draft, no versions or responses (FR-E-1). */
    public Questionnaire duplicate(String id) {
        Questionnaire source = get(id);
        Questionnaire copy = new Questionnaire();
        copy.setPublicId(generatePublicId());
        copy.setName("Copy of " + source.getName());
        copy.setAllowedOrigins(new ArrayList<>(source.getAllowedOrigins()));
        copy.setSubmissionPolicy(source.getSubmissionPolicy());
        Definition draft = source.getDraft() == null ? Definition.empty() : source.getDraft();
        copy.setDraft(draft);
        copy.setDraftHash(canonicalJson.sha256Hex(draft));
        copy.setCurrentVersion(0);
        copy.setLiveHash(null);
        return questionnaires.save(copy);
    }

    /** PATCH — rename, update allowedOrigins (FR-B-3) and/or submissionPolicy (FR5-4). */
    public Questionnaire patch(String id, String name, List<String> allowedOrigins, String submissionPolicy) {
        Questionnaire q = get(id);
        if (name != null) {
            if (name.isBlank()) {
                throw ApiException.badRequest("name must not be blank");
            }
            q.setName(name);
        }
        if (allowedOrigins != null) {
            List<String> problems = validateOrigins(allowedOrigins);
            if (!problems.isEmpty()) {
                throw ApiException.badRequest("invalid allowedOrigins", problems);
            }
            q.setAllowedOrigins(new ArrayList<>(allowedOrigins));
        }
        if (submissionPolicy != null) {
            if (!Questionnaire.POLICY_MULTIPLE.equals(submissionPolicy)
                    && !Questionnaire.POLICY_ONE_PER_REF.equals(submissionPolicy)) {
                throw ApiException.badRequest("invalid submissionPolicy '" + submissionPolicy
                        + "' (must be MULTIPLE or ONE_PER_REF)");
            }
            q.setSubmissionPolicy(submissionPolicy);
        }
        return questionnaires.save(q);
    }

    /** DELETE — removes questionnaire and its versions; responses are retained (FR-E-1). */
    public void delete(String id) {
        Questionnaire q = get(id);
        versions.deleteByQuestionnaireId(q.getId());
        questionnaires.deleteById(q.getId());
    }

    /**
     * FR4-9 (P4-D7): hard-deletes one response — erasure, not soft-hide. The
     * response must belong to the given questionnaire (404 otherwise); its
     * ACTIVE files cascade first (storage objects deleted best-effort, rows
     * tombstoned), then the answer document is removed. Idempotent in effect:
     * the second call finds nothing and 404s, which is also the signal that
     * resets any respondent still holding the id in sessionStorage (FR4-3).
     */
    public void deleteResponse(String id, String responseId) {
        Questionnaire q = get(id);
        ResponseDocument r = responses.findByResponseId(responseId)
                .filter(doc -> q.getId().equals(doc.getQuestionnaireId()))
                .orElseThrow(() -> ApiException.notFound("response not found"));
        fileService.deleteResponseFiles(responseId);
        responses.delete(r);
    }

    /**
     * FR4-12 (P4-D3): import always creates, never overwrites and never
     * auto-publishes — fresh publicId, empty origins, the imported definition
     * as an unpublished draft (currentVersion 0). Unknown envelope or schema
     * versions are rejected naming both sides; the definition must pass the
     * full publish-grade validation (FR-B-1/FR2-3) or nothing is created.
     */
    public Questionnaire importQuestionnaire(QuestionnaireImportRequest request) {
        if (request == null) {
            throw ApiException.badRequest("import body is required");
        }
        if (request.formsEngineExport() == null || request.formsEngineExport() != EXPORT_VERSION) {
            throw ApiException.badRequest("export version mismatch: the file has formsEngineExport "
                    + (request.formsEngineExport() == null ? "(missing)" : request.formsEngineExport())
                    + "; this backend supports formsEngineExport " + EXPORT_VERSION);
        }
        Definition definition = request.definition();
        if (definition == null) {
            throw ApiException.badRequest("export file has no definition");
        }
        int schemaVersion = definition.getSchemaVersion();
        if (schemaVersion != 1 && schemaVersion != 2) {
            throw ApiException.badRequest("schema version mismatch: the file's definition has schemaVersion "
                    + schemaVersion + "; this backend supports schemaVersion 1 and 2");
        }
        String name = request.name() == null ? "" : request.name().trim();
        if (name.isEmpty()) {
            throw ApiException.badRequest("export file has no name");
        }
        requireWithinSizeCap(definition);
        List<String> problems = validator.validatePublish(definition);
        if (!problems.isEmpty()) {
            throw ApiException.badRequest("import validation failed", problems);
        }

        Questionnaire q = new Questionnaire();
        q.setPublicId(generatePublicId());
        q.setName(questionnaires.existsByName(name) ? name + " (imported)" : name);
        q.setDraft(definition);
        q.setDraftHash(canonicalJson.sha256Hex(definition));
        q.setCurrentVersion(0);
        return questionnaires.save(q);
    }

    private byte[] requireWithinSizeCap(Definition definition) {
        if (definition == null) {
            throw ApiException.badRequest("definition body is required");
        }
        byte[] canonical = canonicalJson.canonicalBytes(definition);
        if (canonical.length > MAX_DEFINITION_BYTES) {
            throw ApiException.badRequest("definition too large",
                    List.of("definition is " + canonical.length + " bytes; the maximum is " + MAX_DEFINITION_BYTES + " bytes (1 MB)"));
        }
        return canonical;
    }

    /**
     * Origins must be syntactically absolute http/https origins with no path,
     * query, fragment or userinfo. "*" is rejected — an empty list already
     * means allow-all (FR-B-3).
     */
    static List<String> validateOrigins(List<String> origins) {
        List<String> problems = new ArrayList<>();
        for (String origin : origins) {
            if (origin == null || origin.isBlank()) {
                problems.add("origin must not be blank");
                continue;
            }
            if ("*".equals(origin)) {
                problems.add("'*' is not allowed — an empty allowedOrigins list already allows all origins");
                continue;
            }
            if (!isValidOrigin(origin)) {
                problems.add("'" + origin + "' is not a valid origin — expected e.g. https://app.example.com (scheme + host, optional port, no path)");
            }
        }
        return problems;
    }

    private static boolean isValidOrigin(String origin) {
        URI uri;
        try {
            uri = new URI(origin);
        } catch (Exception e) {
            return false;
        }
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equals("http") || scheme.equals("https"))) {
            return false;
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            return false;
        }
        if (uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            return false;
        }
        String path = uri.getRawPath();
        return path == null || path.isEmpty();
    }

    private String generatePublicId() {
        StringBuilder sb = new StringBuilder("q_");
        for (int i = 0; i < PUBLIC_ID_LENGTH; i++) {
            sb.append(PUBLIC_ID_ALPHABET.charAt(random.nextInt(PUBLIC_ID_ALPHABET.length())));
        }
        return sb.toString();
    }

    private static ObjectId parseId(String id) {
        if (id == null || !ObjectId.isValid(id)) {
            throw ApiException.notFound("questionnaire not found");
        }
        return new ObjectId(id);
    }
}
