package io.formsengine.storage;

import java.io.InputStream;

/**
 * Pluggable file storage adapter (Phase 3 FR3-1, §2.1). Two implementations —
 * {@link FilesystemStorage} and {@link S3Storage} — selected at startup via
 * {@code forms.storage.mode} (FR3-2). Operations are deliberately confined to
 * the boring core every S3-compatible provider supports: no listing (the
 * {@code uploaded_files} collection in Mongo is the index — storage is never
 * enumerated), no bucket lifecycle, no multipart API surface.
 */
public interface FileStorage {

    /**
     * Stores {@code content} under {@code storageKey}, streaming end-to-end
     * (NFR3-1 — implementations must never buffer the whole file in heap).
     */
    void put(String storageKey, InputStream content, long length, String contentType);

    /**
     * Opens the stored object for reading.
     *
     * @throws StorageNotFoundException when no object exists under the key
     */
    InputStream get(String storageKey);

    /** Deletes the object; idempotent — deleting a missing key is a no-op. */
    void delete(String storageKey);

    /** True when an object exists under the key. */
    boolean exists(String storageKey);
}
