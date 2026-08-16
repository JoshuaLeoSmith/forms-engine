package io.formsengine.service;

import io.formsengine.domain.ResponseDocument;
import io.formsengine.domain.UploadedFileDocument;
import io.formsengine.repository.ResponseRepository;
import io.formsengine.repository.UploadedFileRepository;
import io.formsengine.storage.FileStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Orphan cleanup job (FR3-12, NFR3-3): deletes every ACTIVE file older than
 * the grace period ({@code FILE_ORPHAN_GRACE_HOURS}, default 24) whose fileId
 * does not appear in its response's current answers map — covering abandoned
 * sessions, failed rule-driven deletes, and uploads to questions the
 * respondent later cleared. Files referenced by a COMPLETED response's answers
 * are permanent. Safe to run concurrently with live traffic: the grace period
 * plus the answers-map check make it race-tolerant — a file uploaded seconds
 * ago is never eligible. Tombstones are written only after a successful
 * storage deletion; a failed delete is retried next run.
 *
 * <p>Hourly by default ({@code FILE_CLEANUP_CRON}), guarded by
 * {@code FILE_CLEANUP_ENABLED}; {@link #runOnce()} is public for tests and
 * curious operators.
 */
@Service
public class FileCleanupService {

    private static final Logger log = LoggerFactory.getLogger(FileCleanupService.class);

    /** One run's per-summary counters (FR3-12). */
    public record RunSummary(int scanned, int deleted, int failed) {
    }

    private final UploadedFileRepository files;
    private final ResponseRepository responses;
    private final FileStorage storage;
    private final boolean enabled;
    private final long graceHours;

    public FileCleanupService(UploadedFileRepository files,
                              ResponseRepository responses,
                              FileStorage storage,
                              @Value("${forms.uploads.cleanup-enabled:true}") boolean enabled,
                              @Value("${forms.uploads.orphan-grace-hours:24}") long graceHours) {
        this.files = files;
        this.responses = responses;
        this.storage = storage;
        this.enabled = enabled;
        this.graceHours = graceHours;
    }

    /** Scheduled entry point; delegates to {@link #runOnce()} when enabled. */
    @Scheduled(cron = "${forms.uploads.cleanup-cron:0 0 * * * *}")
    public void scheduledRun() {
        if (!enabled) {
            return;
        }
        runOnce();
    }

    /** One full cleanup pass over every grace-expired ACTIVE file. */
    public RunSummary runOnce() {
        Instant cutoff = Instant.now().minus(Duration.ofHours(graceHours));
        List<UploadedFileDocument> candidates = files.findByStatusAndCreatedAtBefore(
                UploadedFileDocument.STATUS_ACTIVE, cutoff);
        int scanned = 0;
        int deleted = 0;
        int failed = 0;
        for (UploadedFileDocument file : candidates) {
            scanned++;
            ResponseDocument response = responses.findByResponseId(file.getResponseId()).orElse(null);
            if (response != null && isReferenced(response.getAnswers(), file.getFileId())) {
                // Referenced in the current answers map — keep, regardless of
                // status (completed-and-referenced is permanent, FR3-12).
                continue;
            }
            try {
                storage.delete(file.getStorageKey());
                file.setStatus(UploadedFileDocument.STATUS_DELETED);
                file.setDeletedAt(Instant.now());
                files.save(file);
                deleted++;
            } catch (Exception e) {
                // Tombstone only after successful storage deletion; leave
                // ACTIVE so the next run retries (FR3-12).
                log.warn("cleanup failed to delete storage object '{}' for file {}: {}",
                        file.getStorageKey(), file.getFileId(), e.getMessage());
                failed++;
            }
        }
        log.info("file cleanup run: scanned={} deleted={} failed={} (grace {}h)",
                scanned, deleted, failed, graceHours);
        return new RunSummary(scanned, deleted, failed);
    }

    /**
     * True when the fileId appears in any answer value shaped like a file
     * reference array (FR3-9): a List whose elements are Maps with a matching
     * {@code fileId} entry.
     */
    private static boolean isReferenced(Map<String, Object> answers, String fileId) {
        if (answers == null) {
            return false;
        }
        for (Object value : answers.values()) {
            if (!(value instanceof List<?> list)) {
                continue;
            }
            for (Object element : list) {
                if (element instanceof Map<?, ?> map && fileId.equals(map.get("fileId"))) {
                    return true;
                }
            }
        }
        return false;
    }
}
