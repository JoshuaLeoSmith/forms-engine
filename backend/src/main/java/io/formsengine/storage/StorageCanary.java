package io.formsengine.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;

/**
 * Startup storage check (FR3-6): a put/get/delete round-trip with a tiny
 * canary object, run after all singletons are initialized but before the
 * embedded server starts serving. Storage errors must surface at deploy time,
 * not at the first respondent's upload — failure aborts startup with a message
 * naming the configured mode and the likely misconfiguration.
 */
@Component
public class StorageCanary implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(StorageCanary.class);

    private final FileStorage storage;
    private final String mode;

    public StorageCanary(FileStorage storage, @Value("${forms.storage.mode:filesystem}") String mode) {
        this.storage = storage;
        this.mode = mode;
    }

    @Override
    public void afterSingletonsInstantiated() {
        String key = "_canary/" + UUID.randomUUID().toString().replace("-", "");
        byte[] payload = "forms-engine-canary".getBytes(StandardCharsets.UTF_8);
        try {
            storage.put(key, new ByteArrayInputStream(payload), payload.length, "text/plain");
            byte[] readBack;
            try (InputStream in = storage.get(key)) {
                readBack = in.readAllBytes();
            }
            storage.delete(key);
            if (!Arrays.equals(payload, readBack)) {
                throw new IllegalStateException("canary object read back with different content");
            }
            log.info("storage canary passed (mode={})", mode);
        } catch (Exception e) {
            throw new IllegalStateException("storage canary failed in mode '" + mode + "': " + e.getMessage()
                    + " — check " + hint() + " before serving traffic (FR3-6)", e);
        }
    }

    private String hint() {
        if ("s3".equalsIgnoreCase(mode)) {
            return "S3_ENDPOINT / S3_BUCKET (must already exist) / S3_ACCESS_KEY / S3_SECRET_KEY / "
                    + "S3_REGION / S3_PATH_STYLE (true for MinIO, false for AWS)";
        }
        return "FS_STORAGE_PATH (directory must be creatable and writable)";
    }
}
