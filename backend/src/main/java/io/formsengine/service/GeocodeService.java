package io.formsengine.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.formsengine.web.ApiException;
import io.formsengine.web.dto.PublicDtos.GeocodeSuggestion;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Photon geocoding proxy (FR2-11/12/13): the renderer never talks to Photon
 * directly — per-deployment geocoder configuration lives here, along with the
 * cache/rate-limit choke point. Upstream failure, timeout or a malformed body
 * degrade to an empty list; autocomplete must never surface a respondent-facing
 * error (§6.8.4).
 */
@Service
public class GeocodeService {

    /** FR2-13 request protection. */
    static final int MIN_QUERY_LENGTH = 3;
    static final int MAX_QUERY_LENGTH = 200;
    static final int DEFAULT_LIMIT = 5;
    static final int MAX_LIMIT = 10;
    static final Duration UPSTREAM_TIMEOUT = Duration.ofSeconds(2);

    /** When filtering by country, over-fetch from Photon before truncating. */
    static final int MAX_UPSTREAM_LIMIT = 30;

    private final RestClient photon;
    private final ObjectMapper mapper = new ObjectMapper();

    public GeocodeService(@Value("${forms.photon.base-url:https://photon.komoot.io}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(UPSTREAM_TIMEOUT);
        factory.setReadTimeout(UPSTREAM_TIMEOUT);
        this.photon = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    /**
     * Searches Photon and maps its GeoJSON FeatureCollection to normalized
     * suggestions. {@code country} (alpha-2, optional) filters results to that
     * country; {@code limit} defaults to {@value #DEFAULT_LIMIT} and is
     * clamped to {@value #MAX_LIMIT}.
     */
    public List<GeocodeSuggestion> search(String q, String country, Integer limit) {
        String query = q == null ? "" : q.trim();
        if (query.length() < MIN_QUERY_LENGTH || query.length() > MAX_QUERY_LENGTH) {
            throw ApiException.badRequest("q is required and must be between " + MIN_QUERY_LENGTH
                    + " and " + MAX_QUERY_LENGTH + " characters");
        }
        int effectiveLimit = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
        String countryFilter = country == null || country.isBlank() ? null : country.trim();
        // With a country filter, over-fetch so filtering still fills the page.
        int upstreamLimit = countryFilter == null
                ? effectiveLimit
                : Math.min(effectiveLimit * 3, MAX_UPSTREAM_LIMIT);

        try {
            String body = photon.get()
                    .uri(builder -> builder.path("/api")
                            .queryParam("q", "{q}")
                            .queryParam("limit", "{limit}")
                            .build(query, upstreamLimit))
                    .retrieve()
                    .body(String.class);
            return mapFeatures(mapper.readTree(body), countryFilter, effectiveLimit);
        } catch (Exception e) {
            // FR2-13: degrade silently — autocomplete is an accelerator, not a gate.
            return List.of();
        }
    }

    private static List<GeocodeSuggestion> mapFeatures(JsonNode root, String countryFilter, int limit) {
        JsonNode features = root == null ? null : root.path("features");
        if (features == null || !features.isArray()) {
            return List.of();
        }
        List<GeocodeSuggestion> suggestions = new ArrayList<>();
        for (JsonNode feature : features) {
            JsonNode props = feature.path("properties");
            String countryCode = text(props, "countrycode").toUpperCase(Locale.ROOT);
            if (countryFilter != null && !countryFilter.equalsIgnoreCase(countryCode)) {
                continue;
            }
            String street = text(props, "street");
            String housenumber = text(props, "housenumber");
            String line1 = street.isEmpty()
                    ? text(props, "name")
                    : (housenumber.isEmpty() ? street : housenumber + " " + street);
            String city = firstNonEmpty(
                    text(props, "city"), text(props, "district"), text(props, "town"), text(props, "village"));
            String state = text(props, "state");
            if ("US".equals(countryCode)) {
                state = UsStates.toUspsCode(state);
            }
            String postalCode = text(props, "postcode");
            String countryName = text(props, "country");
            String label = buildLabel(line1, city, state, postalCode,
                    countryName.isEmpty() ? countryCode : countryName);
            suggestions.add(new GeocodeSuggestion(line1, city, state, postalCode, countryCode, label));
            if (suggestions.size() >= limit) {
                break;
            }
        }
        return suggestions;
    }

    /** "line1, city, state postalCode, country" from the non-empty parts. */
    private static String buildLabel(String line1, String city, String state, String postalCode, String country) {
        List<String> parts = new ArrayList<>();
        if (!line1.isEmpty()) {
            parts.add(line1);
        }
        if (!city.isEmpty()) {
            parts.add(city);
        }
        String statePostal = (state + " " + postalCode).trim();
        if (!statePostal.isEmpty()) {
            parts.add(statePostal);
        }
        if (!country.isEmpty()) {
            parts.add(country);
        }
        return String.join(", ", parts);
    }

    private static String text(JsonNode props, String field) {
        JsonNode node = props.get(field);
        return node != null && node.isValueNode() && !node.isNull() ? node.asText().trim() : "";
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (!value.isEmpty()) {
                return value;
            }
        }
        return "";
    }
}
