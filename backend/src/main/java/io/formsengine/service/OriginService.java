package io.formsengine.service;

import io.formsengine.domain.Questionnaire;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Service;

/**
 * Per-questionnaire origin enforcement for the public runtime API (FR-B-3).
 *
 * <p>Semantics: an empty {@code allowedOrigins} list means allow all; a request
 * without an {@code Origin} header (curl, server-to-server, tests) is always
 * allowed. For GET live the check only controls whether the CORS allow header is
 * emitted (the browser blocks the read); for mutating endpoints a disallowed
 * origin is rejected server-side with 403.
 */
@Service
public class OriginService {

    /** True when the request origin may interact with the questionnaire. */
    public boolean isAllowed(Questionnaire questionnaire, String origin) {
        if (origin == null || origin.isBlank()) {
            return true;
        }
        if (questionnaire.getAllowedOrigins() == null || questionnaire.getAllowedOrigins().isEmpty()) {
            return true;
        }
        return questionnaire.getAllowedOrigins().contains(origin);
    }

    /** Echoes the allow-origin header (plus Vary: Origin) when the origin is allowed. */
    public void applyCorsHeaders(Questionnaire questionnaire, String origin, HttpServletResponse response) {
        response.addHeader("Vary", "Origin");
        if (origin != null && !origin.isBlank() && isAllowed(questionnaire, origin)) {
            response.setHeader("Access-Control-Allow-Origin", origin);
        }
    }
}
