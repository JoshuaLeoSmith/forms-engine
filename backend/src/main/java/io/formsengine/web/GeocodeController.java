package io.formsengine.web;

import io.formsengine.service.GeocodeService;
import io.formsengine.web.dto.PublicDtos.GeocodeSuggestion;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Public geocoding proxy endpoint (FR2-11/12/13), consumed by the ADDRESS
 * autocomplete (§6.8.4). Unlike the questionnaire-scoped endpoints it is
 * origin-agnostic — there is no questionnaire to scope origins to — so the
 * CORS allow header is echoed for any origin. Abuse is contained by the
 * dedicated, stricter geocode rate-limit bucket ({@code RateLimitFilter}).
 */
@RestController
@RequestMapping("/public/v1")
public class GeocodeController {

    private final GeocodeService service;

    public GeocodeController(GeocodeService service) {
        this.service = service;
    }

    @GetMapping("/geocode")
    public List<GeocodeSuggestion> geocode(@RequestParam(required = false) String q,
                                           @RequestParam(required = false) String country,
                                           @RequestParam(required = false) Integer limit,
                                           @RequestHeader(value = "Origin", required = false) String origin,
                                           HttpServletResponse httpResponse) {
        httpResponse.addHeader("Vary", "Origin");
        if (origin != null && !origin.isBlank()) {
            httpResponse.setHeader("Access-Control-Allow-Origin", origin);
        }
        return service.search(q, country, limit);
    }
}
