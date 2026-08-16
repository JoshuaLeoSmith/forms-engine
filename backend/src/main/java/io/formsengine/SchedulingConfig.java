package io.formsengine;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables Spring scheduling for the orphan-file cleanup job (Phase 3 FR3-12).
 * The job itself guards on {@code forms.uploads.cleanup-enabled}, so test
 * contexts (which set it to false) never run cleanup as a side effect.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
