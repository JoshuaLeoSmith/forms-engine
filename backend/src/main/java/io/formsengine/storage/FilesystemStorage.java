package io.formsengine.storage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Filesystem storage backend (FR3-3). The root directory comes from
 * {@code forms.storage.fs-path} ({@code FS_STORAGE_PATH}); it is created if
 * absent and startup fails loudly if it is not writable. Writes are atomic:
 * the content is streamed to a temp file in the destination directory (same
 * filesystem), then renamed with {@code ATOMIC_MOVE} — a kill mid-upload never
 * leaves a half-written object under a real key. Storage keys map to
 * subdirectories beneath the root; every resolved path is verified to be
 * strictly inside the root (defense-in-depth even though keys are
 * server-generated, §7).
 */
public class FilesystemStorage implements FileStorage {

    private final Path root;

    public FilesystemStorage(Path rootPath) {
        this.root = rootPath.toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new IllegalStateException("filesystem storage root '" + root
                    + "' cannot be created — check FS_STORAGE_PATH and directory permissions", e);
        }
        if (!Files.isDirectory(root) || !Files.isWritable(root)) {
            throw new IllegalStateException("filesystem storage root '" + root
                    + "' is not a writable directory — check FS_STORAGE_PATH and directory permissions");
        }
    }

    @Override
    public void put(String storageKey, InputStream content, long length, String contentType) {
        Path target = resolveInsideRoot(storageKey);
        Path tmp = null;
        try {
            Files.createDirectories(target.getParent());
            tmp = Files.createTempFile(target.getParent(), ".upload-", ".tmp");
            try (var out = Files.newOutputStream(tmp)) {
                content.transferTo(out);
            }
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            if (tmp != null) {
                try {
                    Files.deleteIfExists(tmp);
                } catch (IOException ignored) {
                    // Best effort — an orphaned .tmp file is harmless.
                }
            }
            throw new StorageException("failed to write '" + storageKey + "' to filesystem storage", e);
        }
    }

    @Override
    public InputStream get(String storageKey) {
        Path path = resolveInsideRoot(storageKey);
        if (!Files.isRegularFile(path)) {
            throw new StorageNotFoundException(storageKey);
        }
        try {
            return Files.newInputStream(path);
        } catch (IOException e) {
            throw new StorageException("failed to read '" + storageKey + "' from filesystem storage", e);
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            Files.deleteIfExists(resolveInsideRoot(storageKey));
        } catch (IOException e) {
            throw new StorageException("failed to delete '" + storageKey + "' from filesystem storage", e);
        }
    }

    @Override
    public boolean exists(String storageKey) {
        return Files.isRegularFile(resolveInsideRoot(storageKey));
    }

    /**
     * FR3-3 path containment: resolves the key beneath the root and rejects
     * any key whose normalized path would escape it.
     */
    private Path resolveInsideRoot(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            throw new StorageException("storage key must not be blank");
        }
        Path resolved = root.resolve(storageKey).normalize();
        if (!resolved.startsWith(root) || resolved.equals(root)) {
            throw new StorageException("storage key '" + storageKey + "' escapes the storage root");
        }
        return resolved;
    }
}
