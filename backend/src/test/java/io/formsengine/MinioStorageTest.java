package io.formsengine;

import io.formsengine.domain.UploadedFileDocument;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;

import java.net.URI;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * NFR3-2: the S3 backend against a real MinIO testcontainer — the same code
 * path the shipped compose stack runs (P3-D8). The bucket is created with a
 * plain S3 client before the Spring context starts, because the FR3-6 startup
 * canary requires it to exist (compose does the same with an init container).
 * One full upload → download → delete flow through the public/management APIs.
 */
class MinioStorageTest extends FileTestSupport {

    static {
        // docker-java (bundled with testcontainers 1.21.x) pins API version
        // 1.32, which Docker Engine 29+ rejects (minimum 1.40). 1.41 is
        // accepted by every engine since 20.10.
        if (System.getenv("DOCKER_API_VERSION") == null && System.getProperty("api.version") == null) {
            System.setProperty("api.version", "1.41");
        }
    }

    private static final String BUCKET = "forms-engine-test-uploads";
    private static final String MINIO_USER = "minioadmin";
    private static final String MINIO_PASSWORD = "minioadmin";

    private static GenericContainer<?> minio;

    @DynamicPropertySource
    static void minioProperties(DynamicPropertyRegistry registry) {
        minio = new GenericContainer<>("minio/minio:latest")
                .withEnv("MINIO_ROOT_USER", MINIO_USER)
                .withEnv("MINIO_ROOT_PASSWORD", MINIO_PASSWORD)
                .withCommand("server", "/data")
                .withExposedPorts(9000)
                .waitingFor(Wait.forHttp("/minio/health/ready").forPort(9000));
        minio.start();
        String endpoint = "http://" + minio.getHost() + ":" + minio.getMappedPort(9000);

        // FR3-6: the canary needs the bucket to exist before the context boots.
        try (S3Client s3 = S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.US_EAST_1)
                .forcePathStyle(true)
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(MINIO_USER, MINIO_PASSWORD)))
                .build()) {
            s3.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
        }

        registry.add("forms.storage.mode", () -> "s3");
        registry.add("forms.storage.s3.endpoint", () -> endpoint);
        registry.add("forms.storage.s3.bucket", () -> BUCKET);
        registry.add("forms.storage.s3.access-key", () -> MINIO_USER);
        registry.add("forms.storage.s3.secret-key", () -> MINIO_PASSWORD);
        registry.add("forms.storage.s3.region", () -> "us-east-1");
        registry.add("forms.storage.s3.path-style", () -> "true");
    }

    @AfterAll
    static void stopMinio() {
        if (minio != null) {
            minio.stop();
        }
    }

    @Test
    void fullUploadDownloadDeleteFlowAgainstMinio() {
        Ctx ctx = publishQuestionnaire("MinIO Flow",
                Defs.fileUploadQuestion("q1", "resume", List.of("DOCUMENTS"), 2, 10));
        String responseId = newResponse(ctx.publicId());
        byte[] pdf = TestFiles.pdf(4096);

        // Upload through the public API lands in the bucket.
        ResponseEntity<Map<String, Object>> uploaded = upload(responseId, "resume", "minio.pdf", pdf);
        assertEquals(201, uploaded.getStatusCode().value());
        String fileId = (String) uploaded.getBody().get("fileId");
        UploadedFileDocument doc = uploadedFiles.findByFileId(fileId).orElseThrow();
        assertEquals(ctx.id() + "/" + responseId + "/" + fileId, doc.getStorageKey());
        assertTrue(storage.exists(doc.getStorageKey()), "the object must exist in MinIO");

        // Management download streams the exact bytes back with the FR3-23 posture.
        ResponseEntity<byte[]> downloaded = download(ctx.id(), responseId, fileId);
        assertEquals(200, downloaded.getStatusCode().value());
        assertEquals("nosniff", downloaded.getHeaders().getFirst("X-Content-Type-Options"));
        assertEquals("application/pdf", downloaded.getHeaders().getContentType().toString());
        assertArrayEquals(pdf, downloaded.getBody());

        // Delete removes the object and tombstones the row; re-delete is a no-op.
        assertEquals(204, deleteFile(responseId, fileId).getStatusCode().value());
        assertFalse(storage.exists(doc.getStorageKey()), "the MinIO object must be gone");
        assertEquals(UploadedFileDocument.STATUS_DELETED,
                uploadedFiles.findByFileId(fileId).orElseThrow().getStatus());
        assertEquals(204, deleteFile(responseId, fileId).getStatusCode().value());
    }
}
