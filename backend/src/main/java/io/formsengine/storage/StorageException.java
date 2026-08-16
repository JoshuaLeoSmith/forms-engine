package io.formsengine.storage;

/**
 * Unchecked wrapper for storage backend failures (I/O errors, unreachable
 * endpoint, bad credentials). Surfaces as a 500 — storage failures are
 * operational, never the respondent's fault.
 */
public class StorageException extends RuntimeException {

    public StorageException(String message, Throwable cause) {
        super(message, cause);
    }

    public StorageException(String message) {
        super(message);
    }
}
