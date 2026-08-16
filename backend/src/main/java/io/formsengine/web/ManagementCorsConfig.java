package io.formsengine.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Management API CORS: allow everything on {@code /api/**} (FR-B-2, NFR-3).
 * The self-hoster protects this route group at the network layer; per-questionnaire
 * origin enforcement only applies to the public runtime API.
 */
@Configuration
public class ManagementCorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("*")
                .allowedHeaders("*");
    }
}
