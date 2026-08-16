package io.formsengine.storage;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.InputStream;

/**
 * S3-compatible storage backend (FR3-4): AWS SDK v2 against real AWS S3 or any
 * compatible provider (MinIO in the default compose stack; expected-compatible
 * per protocol: Cloudflare R2, Backblaze B2, DigitalOcean Spaces, GCS interop
 * mode). Client construction — endpoint override, credentials, region and the
 * classic {@code S3_PATH_STYLE} knob — lives in {@link StorageConfig}.
 */
public class S3Storage implements FileStorage {

    private final S3Client s3;
    private final String bucket;

    public S3Storage(S3Client s3, String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    @Override
    public void put(String storageKey, InputStream content, long length, String contentType) {
        try {
            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(storageKey)
                    .contentType(contentType)
                    .contentLength(length)
                    .build();
            s3.putObject(request, RequestBody.fromInputStream(content, length));
        } catch (S3Exception e) {
            throw new StorageException("failed to write '" + storageKey + "' to s3 bucket '" + bucket + "'", e);
        }
    }

    @Override
    public InputStream get(String storageKey) {
        try {
            return s3.getObject(GetObjectRequest.builder().bucket(bucket).key(storageKey).build());
        } catch (NoSuchKeyException e) {
            throw new StorageNotFoundException(storageKey);
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                throw new StorageNotFoundException(storageKey);
            }
            throw new StorageException("failed to read '" + storageKey + "' from s3 bucket '" + bucket + "'", e);
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            // S3 DeleteObject is idempotent by protocol: deleting a missing key succeeds.
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(storageKey).build());
        } catch (S3Exception e) {
            throw new StorageException("failed to delete '" + storageKey + "' from s3 bucket '" + bucket + "'", e);
        }
    }

    @Override
    public boolean exists(String storageKey) {
        try {
            s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(storageKey).build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return false;
            }
            throw new StorageException("failed to check '" + storageKey + "' in s3 bucket '" + bucket + "'", e);
        }
    }
}
