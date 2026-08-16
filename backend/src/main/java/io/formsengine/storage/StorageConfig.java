package io.formsengine.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

import java.net.URI;
import java.nio.file.Path;

/**
 * Storage mode selection (FR3-2): {@code forms.storage.mode} =
 * {@code STORAGE_MODE} chooses which {@link FileStorage} bean exists —
 * {@code filesystem} (default for bare local runs) or {@code s3} (the shipped
 * compose stack sets it, so self-hosters exercise the production-identical
 * path, P3-D8).
 */
@Configuration
public class StorageConfig {

    @Bean
    public FileStorage fileStorage(
            @Value("${forms.storage.mode:filesystem}") String mode,
            @Value("${forms.storage.fs-path:./data/uploads}") String fsPath,
            @Value("${forms.storage.s3.endpoint:}") String s3Endpoint,
            @Value("${forms.storage.s3.bucket:forms-engine-uploads}") String s3Bucket,
            @Value("${forms.storage.s3.access-key:}") String s3AccessKey,
            @Value("${forms.storage.s3.secret-key:}") String s3SecretKey,
            @Value("${forms.storage.s3.region:us-east-1}") String s3Region,
            @Value("${forms.storage.s3.path-style:true}") boolean s3PathStyle) {
        return switch (mode == null ? "" : mode.trim().toLowerCase()) {
            case "filesystem" -> new FilesystemStorage(Path.of(fsPath));
            case "s3" -> new S3Storage(
                    buildS3Client(s3Endpoint, s3AccessKey, s3SecretKey, s3Region, s3PathStyle), s3Bucket);
            default -> throw new IllegalStateException("unknown storage mode '" + mode
                    + "' — STORAGE_MODE must be 'filesystem' or 's3' (FR3-2)");
        };
    }

    /**
     * FR3-4: endpoint override only when {@code S3_ENDPOINT} is set (empty ⇒
     * real AWS, the SDK derives the endpoint from the region); explicit static
     * credentials when provided, otherwise the SDK default provider chain
     * (instance profiles, env vars); {@code S3_PATH_STYLE} → forcePathStyle —
     * true for MinIO and most compatibles, false for AWS.
     */
    private static S3Client buildS3Client(String endpoint, String accessKey, String secretKey,
                                          String region, boolean pathStyle) {
        var builder = S3Client.builder()
                .region(Region.of(region))
                .forcePathStyle(pathStyle);
        if (endpoint != null && !endpoint.isBlank()) {
            builder = builder.endpointOverride(URI.create(endpoint.trim()));
        }
        if (accessKey != null && !accessKey.isBlank()) {
            builder = builder.credentialsProvider(
                    StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)));
        }
        return builder.build();
    }
}
