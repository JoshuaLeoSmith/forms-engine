package io.formsengine.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Handles CORS preflight (OPTIONS) for the public runtime API (FR-B-3).
 *
 * <p>Preflight is deliberately permissive — it echoes any request origin — because
 * real enforcement happens on the actual request: the live GET withholds the
 * allow header for disallowed origins and mutating endpoints return 403
 * server-side. Denying at preflight would only change the browser error message.
 */
@Component
public class PublicPreflightFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod()) && request.getRequestURI().startsWith("/public/")) {
            String origin = request.getHeader("Origin");
            if (origin != null && !origin.isBlank()) {
                response.setHeader("Access-Control-Allow-Origin", origin);
            }
            // DELETE: respondent file removal, Phase 3 FR3-10/11.
            response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
            response.setHeader("Access-Control-Allow-Headers", "Content-Type");
            response.setHeader("Access-Control-Max-Age", "3600");
            response.addHeader("Vary", "Origin");
            response.setStatus(HttpServletResponse.SC_NO_CONTENT);
            return;
        }
        filterChain.doFilter(request, response);
    }
}
