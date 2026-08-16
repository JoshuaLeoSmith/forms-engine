package io.formsengine.storage;

/** Thrown by {@link FileStorage#get} when no object exists under a key (FR3-1). */
public class StorageNotFoundException extends StorageException {

    public StorageNotFoundException(String storageKey) {
        super("no stored object under key '" + storageKey + "'");
    }
}
