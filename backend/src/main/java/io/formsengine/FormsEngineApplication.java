package io.formsengine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.mongodb.config.EnableMongoAuditing;

/**
 * Forms-Engine backend entry point.
 *
 * <p>Serves the management API ({@code /api/v1}, BRD 9.1) and the public runtime API
 * ({@code /public/v1}, BRD 9.2) backed by MongoDB (BRD 10). Auditing is enabled for
 * {@code createdAt}/{@code updatedAt} timestamps on all documents.
 */
@SpringBootApplication
@EnableMongoAuditing
public class FormsEngineApplication {

    public static void main(String[] args) {
        SpringApplication.run(FormsEngineApplication.class, args);
    }
}
