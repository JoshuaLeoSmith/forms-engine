package io.formsengine;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Geocode proxy happy path against a stub Photon server (FR2-11/13): request
 * validation, GeoJSON mapping including US state normalization, country
 * filtering with upstream over-fetch, and limit clamping.
 */
class GeocodeTest extends BaseApiTest {

    /** Photon-shaped FeatureCollection: one US hit (lowercase countrycode), one Canadian. */
    private static final String CANNED_GEOJSON = """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-75.15,39.83]},
               "properties":{"housenumber":"12","street":"Main Street","city":"Woodbury",
                             "state":"New Jersey","postcode":"08096","countrycode":"us",
                             "country":"United States","name":"12 Main Street"}},
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-79.38,43.65]},
               "properties":{"name":"Main Street Cafe","city":"Toronto","state":"Ontario",
                             "postcode":"M5H 2N2","countrycode":"CA","country":"Canada"}}
            ]}""";

    private static HttpServer photonStub;
    private static volatile String lastUpstreamQuery;

    @DynamicPropertySource
    static void photonBaseUrl(DynamicPropertyRegistry registry) throws IOException {
        photonStub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        photonStub.createContext("/api", exchange -> {
            lastUpstreamQuery = exchange.getRequestURI().getQuery();
            byte[] body = CANNED_GEOJSON.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        photonStub.start();
        registry.add("forms.photon.base-url", () -> "http://127.0.0.1:" + photonStub.getAddress().getPort());
    }

    @AfterAll
    static void stopStub() {
        if (photonStub != null) {
            photonStub.stop(0);
        }
    }

    private ResponseEntity<List<Map<String, Object>>> geocode(String queryString) {
        return rest.exchange("/public/v1/geocode?" + queryString, HttpMethod.GET, null,
                new ParameterizedTypeReference<List<Map<String, Object>>>() {
                });
    }

    @Test
    void mapsPhotonFeaturesAndNormalizesUsStates() {
        ResponseEntity<List<Map<String, Object>>> resp = geocode("q=Main");
        assertEquals(200, resp.getStatusCode().value());
        List<Map<String, Object>> suggestions = resp.getBody();
        assertEquals(2, suggestions.size());

        Map<String, Object> us = suggestions.get(0);
        assertEquals("12 Main Street", us.get("line1"), "line1 = housenumber + street");
        assertEquals("Woodbury", us.get("city"));
        assertEquals("NJ", us.get("state"), "US state names must normalize to USPS codes");
        assertEquals("08096", us.get("postalCode"));
        assertEquals("US", us.get("country"), "countrycode must be uppercased");
        assertEquals("12 Main Street, Woodbury, NJ 08096, United States", us.get("label"));

        Map<String, Object> ca = suggestions.get(1);
        assertEquals("Main Street Cafe", ca.get("line1"), "line1 falls back to name without a street");
        assertEquals("Ontario", ca.get("state"), "non-US states are not normalized");
        assertEquals("CA", ca.get("country"));
    }

    @Test
    void countryFilterKeepsOnlyThatCountryAndOverFetches() {
        ResponseEntity<List<Map<String, Object>>> resp = geocode("q=Main&country=ca");
        assertEquals(200, resp.getStatusCode().value());
        List<Map<String, Object>> suggestions = resp.getBody();
        assertEquals(1, suggestions.size());
        assertEquals("CA", suggestions.get(0).get("country"));
        assertTrue(lastUpstreamQuery.contains("limit=15"),
                "with a country filter the proxy over-fetches limit*3, got: " + lastUpstreamQuery);
    }

    @Test
    void limitIsClampedToTen() {
        ResponseEntity<List<Map<String, Object>>> resp = geocode("q=Main&limit=99");
        assertEquals(200, resp.getStatusCode().value());
        assertTrue(lastUpstreamQuery.contains("limit=10"),
                "limit must clamp to 10, got: " + lastUpstreamQuery);
    }

    @Test
    void shortAndMissingQAre400() {
        ResponseEntity<Map<String, Object>> missing = get("/public/v1/geocode");
        assertEquals(400, missing.getStatusCode().value());
        assertEquals(400, missing.getBody().get("status"), "400 body must use the standard error shape");

        ResponseEntity<Map<String, Object>> tooShort = get("/public/v1/geocode?q=ab");
        assertEquals(400, tooShort.getStatusCode().value());

        ResponseEntity<Map<String, Object>> tooLong = get("/public/v1/geocode?q=" + "x".repeat(201));
        assertEquals(400, tooLong.getStatusCode().value());
    }
}
