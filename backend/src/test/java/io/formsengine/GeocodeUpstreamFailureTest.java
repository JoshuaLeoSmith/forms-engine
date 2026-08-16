package io.formsengine;

import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Geocode proxy degradation (FR2-13): with the upstream unreachable (the test
 * profile points {@code forms.photon.base-url} at a dead port), the endpoint
 * returns 200 with an empty list — autocomplete failure must never surface as
 * a respondent-facing error (§6.8.4).
 */
class GeocodeUpstreamFailureTest extends BaseApiTest {

    @Test
    void unreachableUpstreamReturns200WithEmptyList() {
        ResponseEntity<List<Map<String, Object>>> resp = rest.exchange(
                "/public/v1/geocode?q=Main", HttpMethod.GET, null,
                new ParameterizedTypeReference<List<Map<String, Object>>>() {
                });
        assertEquals(200, resp.getStatusCode().value(), "upstream failure must not surface to respondents");
        assertTrue(resp.getBody().isEmpty(), "upstream failure must degrade to an empty suggestion list");
    }

    @Test
    void requestValidationStillAppliesWhenUpstreamIsDown() {
        assertEquals(400, get("/public/v1/geocode?q=ab").getStatusCode().value());
    }
}
