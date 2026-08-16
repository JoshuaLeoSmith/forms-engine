package io.formsengine.service;

import io.formsengine.definition.Definition;
import io.formsengine.definition.Question;
import io.formsengine.definition.Step;
import io.formsengine.definition.Tab;
import io.formsengine.domain.QuestionnaireVersion;
import io.formsengine.domain.ResponseDocument;
import io.formsengine.domain.UploadedFileDocument;
import io.formsengine.repository.QuestionnaireVersionRepository;
import io.formsengine.repository.ResponseRepository;
import io.formsengine.repository.UploadedFileRepository;
import io.formsengine.storage.FileStorage;
import io.formsengine.storage.StorageException;
import io.formsengine.storage.StorageNotFoundException;
import io.formsengine.web.ApiException;
import io.formsengine.web.dto.ManagementDtos.FileStats;
import io.formsengine.web.dto.ManagementDtos.UploadsConfig;
import io.formsengine.web.dto.PublicDtos.FileReference;
import org.bson.types.ObjectId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Upload lifecycle: the §7 acceptance gauntlet, storage writes, tombstoning
 * and management retrieval (Phase 3 §4, §6, FR3-19/21/23/24). Everything here
 * streams — request body to storage — with no full-file buffering (NFR3-1).
 */
@Service
public class FileService {

    private static final Logger log = LoggerFactory.getLogger(FileService.class);

    private static final long MB = 1024L * 1024L;

    /** One management download: metadata plus the opened storage stream. */
    public record Download(UploadedFileDocument file, InputStream content) {
    }

    private final UploadedFileRepository files;
    private final ResponseRepository responses;
    private final QuestionnaireVersionRepository versions;
    private final FileStorage storage;
    private final ContentVerifier verifier;
    private final FileScanner scanner;
    private final int systemCapMb;
    private final int maxFilesPerResponse;
    private final int maxBytesPerResponseMb;

    public FileService(UploadedFileRepository files,
                       ResponseRepository responses,
                       QuestionnaireVersionRepository versions,
                       FileStorage storage,
                       ContentVerifier verifier,
                       FileScanner scanner,
                       @Value("${forms.uploads.max-file-size-mb:50}") int systemCapMb,
                       @Value("${forms.uploads.max-files-per-response:20}") int maxFilesPerResponse,
                       @Value("${forms.uploads.max-bytes-per-response-mb:200}") int maxBytesPerResponseMb) {
        this.files = files;
        this.responses = responses;
        this.versions = versions;
        this.storage = storage;
        this.verifier = verifier;
        this.scanner = scanner;
        this.systemCapMb = systemCapMb;
        this.maxFilesPerResponse = maxFilesPerResponse;
        this.maxBytesPerResponseMb = maxBytesPerResponseMb;
    }

    /**
     * Multipart upload (§6, FR3-19/21): validates the response state, the
     * target question, every server-enforced cap, then content-verifies,
     * scans, and streams to storage under a fully server-generated key
     * (FR3-7). Returns the §4.2 reference object.
     */
    public FileReference upload(String responseId, String questionCode, MultipartFile file) {
        ResponseDocument r = getResponse(responseId);
        if (ResponseDocument.STATUS_COMPLETED.equals(r.getStatus())) {
            throw ApiException.conflict("response is already completed and can no longer accept uploads");
        }
        if (questionCode == null || questionCode.isBlank()) {
            throw ApiException.badRequest("questionCode is required");
        }
        Question question = findFileUploadQuestion(r, questionCode);
        Map<String, Object> config = question.getTypeConfig();
        int maxFiles = intConfig(config, "maxFiles", 1);
        int maxFileSizeMb = intConfig(config, "maxFileSizeMb", Math.min(10, systemCapMb));
        List<?> categories = config != null && config.get("allowedCategories") instanceof List<?> list
                ? list : List.of();

        long size = file.getSize();
        if (size > maxFileSizeMb * MB) {
            throw ApiException.badRequest("file is " + size + " bytes; question '" + questionCode
                    + "' allows at most " + maxFileSizeMb + " MB per file");
        }

        // FR3-19 per-response totals, counting ACTIVE files.
        List<UploadedFileDocument> active = files.findByResponseIdAndStatus(
                responseId, UploadedFileDocument.STATUS_ACTIVE);
        if (active.size() >= maxFilesPerResponse) {
            throw ApiException.badRequest("this response already has " + active.size()
                    + " uploaded files; the per-response maximum is " + maxFilesPerResponse
                    + " (MAX_FILES_PER_RESPONSE)");
        }
        long activeBytes = active.stream().mapToLong(UploadedFileDocument::getSize).sum();
        if (activeBytes + size > maxBytesPerResponseMb * MB) {
            throw ApiException.badRequest("this upload would bring the response's total to "
                    + (activeBytes + size) + " bytes; the per-response maximum is " + maxBytesPerResponseMb
                    + " MB (MAX_BYTES_PER_RESPONSE_MB)");
        }
        long perQuestion = active.stream().filter(f -> questionCode.equals(f.getQuestionCode())).count();
        if (perQuestion >= maxFiles) {
            throw ApiException.badRequest("question '" + questionCode + "' already has " + perQuestion
                    + " uploaded " + (perQuestion == 1 ? "file" : "files") + "; its maximum is " + maxFiles);
        }

        // FR3-24 filename hygiene, then FR3-21 content verification against the
        // question's category allowlist. The verified type is what gets stored.
        String fileName = sanitizeFileName(file.getOriginalFilename());
        @SuppressWarnings("unchecked")
        List<String> allowedCategories = (List<String>) categories;
        ContentVerifier.Verified verified = verifier.verify(fileName, file, allowedCategories);
        fileName = fallbackIfEmptyBaseName(fileName, verified.extension());

        // FR3-22: malware-scanning hook, post-verification pre-storage.
        try (InputStream in = file.getInputStream()) {
            scanner.scan(fileName, verified.contentType(), in);
        } catch (IOException e) {
            throw ApiException.badRequest("file could not be read");
        }

        // FR3-7: keys are generated entirely server-side; no user-supplied
        // string (filename, question code, content type) ever appears in one.
        String fileId = generateFileId();
        String storageKey = r.getQuestionnaireId().toHexString() + "/" + responseId + "/" + fileId;
        try (InputStream in = file.getInputStream()) {
            storage.put(storageKey, in, size, verified.contentType());
        } catch (IOException e) {
            throw new StorageException("failed to stream upload to storage", e);
        }

        UploadedFileDocument doc = new UploadedFileDocument();
        doc.setFileId(fileId);
        doc.setQuestionnaireId(r.getQuestionnaireId());
        doc.setResponseId(responseId);
        doc.setQuestionCode(questionCode);
        doc.setStorageKey(storageKey);
        doc.setFileName(fileName);
        doc.setSize(size);
        doc.setContentType(verified.contentType());
        doc.setStatus(UploadedFileDocument.STATUS_ACTIVE);
        files.save(doc);

        return new FileReference(fileId, fileName, size, verified.contentType());
    }

    /**
     * Respondent removal (FR3-10, §6): storage object deleted first, then the
     * Mongo row tombstoned. Idempotent — deleting an already-DELETED file is a
     * no-op. Files of other responses are indistinguishable from missing ones
     * (404, no cross-response probing).
     */
    public void deleteFile(String responseId, String fileId) {
        ResponseDocument r = getResponse(responseId);
        UploadedFileDocument f = files.findByFileId(fileId)
                .filter(doc -> responseId.equals(doc.getResponseId()))
                .orElseThrow(() -> ApiException.notFound("file not found"));
        if (ResponseDocument.STATUS_COMPLETED.equals(r.getStatus())) {
            throw ApiException.conflict("response is already completed and its files can no longer be modified");
        }
        if (UploadedFileDocument.STATUS_DELETED.equals(f.getStatus())) {
            return;
        }
        storage.delete(f.getStorageKey());
        f.setStatus(UploadedFileDocument.STATUS_DELETED);
        f.setDeletedAt(Instant.now());
        files.save(f);
    }

    /**
     * FR4-9 cascade: deletes every ACTIVE file of the response — storage
     * object first, then the Mongo row tombstoned (status DELETED, deletedAt).
     * Storage-delete failure is best-effort per file: it is logged and never
     * aborts the caller's response deletion; the row is left ACTIVE so the
     * orphan-cleanup job (FR3-12) retries the storage delete on a later run
     * (its response lookup will find nothing and treat the file as orphaned).
     */
    public void deleteResponseFiles(String responseId) {
        for (UploadedFileDocument f : files.findByResponseIdAndStatus(
                responseId, UploadedFileDocument.STATUS_ACTIVE)) {
            try {
                storage.delete(f.getStorageKey());
            } catch (Exception e) {
                log.warn("response deletion could not delete storage object '{}' for file {}: {}",
                        f.getStorageKey(), f.getFileId(), e.getMessage());
                continue;
            }
            f.setStatus(UploadedFileDocument.STATUS_DELETED);
            f.setDeletedAt(Instant.now());
            files.save(f);
        }
    }

    /**
     * Management download (FR3-23, §6): the file must belong to that
     * questionnaire AND that response, and be ACTIVE — anything else is a 404.
     * The storage key stays internal; {@code fileId} is the only public handle.
     */
    public Download download(String questionnaireId, String responseId, String fileId) {
        if (questionnaireId == null || !ObjectId.isValid(questionnaireId)) {
            throw ApiException.notFound("file not found");
        }
        ObjectId qid = new ObjectId(questionnaireId);
        UploadedFileDocument f = files.findByFileId(fileId)
                .filter(doc -> qid.equals(doc.getQuestionnaireId()))
                .filter(doc -> responseId.equals(doc.getResponseId()))
                .filter(doc -> UploadedFileDocument.STATUS_ACTIVE.equals(doc.getStatus()))
                .orElseThrow(() -> ApiException.notFound("file not found"));
        try {
            return new Download(f, storage.get(f.getStorageKey()));
        } catch (StorageNotFoundException e) {
            throw ApiException.notFound("file not found");
        }
    }

    /** FR3-13: retained-file count and bytes for the deletion-confirmation dialog. */
    public FileStats stats(String questionnaireId) {
        if (questionnaireId == null || !ObjectId.isValid(questionnaireId)) {
            throw ApiException.notFound("questionnaire not found");
        }
        List<UploadedFileDocument> active = files.findByQuestionnaireIdAndStatus(
                new ObjectId(questionnaireId), UploadedFileDocument.STATUS_ACTIVE);
        long totalBytes = active.stream().mapToLong(UploadedFileDocument::getSize).sum();
        return new FileStats(active.size(), totalBytes);
    }

    /**
     * FR3-15: the system caps the editor's config panel must display and
     * validate against — the exact same properties the enforcement uses.
     */
    public UploadsConfig uploadsConfig() {
        return new UploadsConfig(systemCapMb, maxFilesPerResponse, maxBytesPerResponseMb * MB);
    }

    /**
     * FR3-24 filename hygiene: strip path components (everything up to the
     * last {@code /} or {@code \}), control characters and {@code "}, {@code `}
     * and any remaining separators; cap at 255 chars preserving the extension.
     * The sanitized name is stored and used only for display and the download
     * {@code Content-Disposition} — never in storage keys (FR3-7).
     */
    public static String sanitizeFileName(String original) {
        String name = original == null ? "" : original;
        int separator = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (separator >= 0) {
            name = name.substring(separator + 1);
        }
        StringBuilder sb = new StringBuilder(name.length());
        for (char c : name.toCharArray()) {
            if (c < 0x20 || c == 0x7F || c == '"' || c == '`' || c == '/' || c == '\\') {
                continue;
            }
            sb.append(c);
        }
        name = sb.toString().trim();
        if (name.length() > 255) {
            int dot = name.lastIndexOf('.');
            String extension = dot >= 0 ? name.substring(dot) : "";
            if (extension.length() >= 255) {
                name = name.substring(0, 255);
            } else {
                name = name.substring(0, 255 - extension.length()) + extension;
            }
        }
        return name;
    }

    /** FR3-24 fallback: an empty base name collapses to {@code upload.<verified extension>}. */
    public static String fallbackIfEmptyBaseName(String name, String extension) {
        String base = name.substring(0, name.length() - extension.length() - 1);
        if (base.isBlank() || base.chars().allMatch(c -> c == '.')) {
            return "upload." + extension;
        }
        return name;
    }

    private ResponseDocument getResponse(String responseId) {
        return responses.findByResponseId(responseId)
                .orElseThrow(() -> ApiException.notFound("response not found"));
    }

    /**
     * Resolves {@code questionCode} inside the response's <b>pinned</b>
     * version definition (D-5) and requires it to be a FILE_UPLOAD question.
     */
    private Question findFileUploadQuestion(ResponseDocument r, String questionCode) {
        Question question = versions
                .findByQuestionnaireIdAndVersionNumber(r.getQuestionnaireId(), r.getVersionNumber())
                .map(QuestionnaireVersion::getDefinition)
                .map(definition -> findQuestionByCode(definition, questionCode))
                .orElse(null);
        if (question == null) {
            throw ApiException.badRequest("questionCode '" + questionCode
                    + "' does not exist in this response's questionnaire version");
        }
        if (!"FILE_UPLOAD".equals(question.getType())) {
            throw ApiException.badRequest("question '" + questionCode + "' has type " + question.getType()
                    + " — only FILE_UPLOAD questions accept file uploads");
        }
        return question;
    }

    /** Walks steps → tabs → questions (BRD 5.1) for a question with the given code. */
    private static Question findQuestionByCode(Definition definition, String code) {
        for (Question q : definition.getQuestions()) {
            if (code.equals(q.getCode())) {
                return q;
            }
        }
        for (Tab tab : definition.getTabs()) {
            for (Question q : tab.getQuestions()) {
                if (code.equals(q.getCode())) {
                    return q;
                }
            }
        }
        for (Step step : definition.getSteps()) {
            for (Question q : step.getQuestions()) {
                if (code.equals(q.getCode())) {
                    return q;
                }
            }
            for (Tab tab : step.getTabs()) {
                for (Question q : tab.getQuestions()) {
                    if (code.equals(q.getCode())) {
                        return q;
                    }
                }
            }
        }
        return null;
    }

    private static int intConfig(Map<String, Object> config, String key, int fallback) {
        Object value = config == null ? null : config.get(key);
        if (value instanceof Number n && Double.isFinite(n.doubleValue())) {
            return (int) n.doubleValue();
        }
        return fallback;
    }

    /** FR3-7: unguessable public handle, "f_" + UUIDv4 without dashes. */
    private static String generateFileId() {
        return "f_" + UUID.randomUUID().toString().replace("-", "");
    }
}
