package io.formsengine.service;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * USPS two-letter codes for the 50 states, DC and the inhabited territories,
 * used to normalize Photon's spelled-out state names for US geocode results
 * (FR2-11, P2-D6: state stored as a code, displayed as a name).
 */
final class UsStates {

    private static final Map<String, String> NAME_TO_CODE = Map.ofEntries(
            Map.entry("alabama", "AL"),
            Map.entry("alaska", "AK"),
            Map.entry("arizona", "AZ"),
            Map.entry("arkansas", "AR"),
            Map.entry("california", "CA"),
            Map.entry("colorado", "CO"),
            Map.entry("connecticut", "CT"),
            Map.entry("delaware", "DE"),
            Map.entry("florida", "FL"),
            Map.entry("georgia", "GA"),
            Map.entry("hawaii", "HI"),
            Map.entry("idaho", "ID"),
            Map.entry("illinois", "IL"),
            Map.entry("indiana", "IN"),
            Map.entry("iowa", "IA"),
            Map.entry("kansas", "KS"),
            Map.entry("kentucky", "KY"),
            Map.entry("louisiana", "LA"),
            Map.entry("maine", "ME"),
            Map.entry("maryland", "MD"),
            Map.entry("massachusetts", "MA"),
            Map.entry("michigan", "MI"),
            Map.entry("minnesota", "MN"),
            Map.entry("mississippi", "MS"),
            Map.entry("missouri", "MO"),
            Map.entry("montana", "MT"),
            Map.entry("nebraska", "NE"),
            Map.entry("nevada", "NV"),
            Map.entry("new hampshire", "NH"),
            Map.entry("new jersey", "NJ"),
            Map.entry("new mexico", "NM"),
            Map.entry("new york", "NY"),
            Map.entry("north carolina", "NC"),
            Map.entry("north dakota", "ND"),
            Map.entry("ohio", "OH"),
            Map.entry("oklahoma", "OK"),
            Map.entry("oregon", "OR"),
            Map.entry("pennsylvania", "PA"),
            Map.entry("rhode island", "RI"),
            Map.entry("south carolina", "SC"),
            Map.entry("south dakota", "SD"),
            Map.entry("tennessee", "TN"),
            Map.entry("texas", "TX"),
            Map.entry("utah", "UT"),
            Map.entry("vermont", "VT"),
            Map.entry("virginia", "VA"),
            Map.entry("washington", "WA"),
            Map.entry("west virginia", "WV"),
            Map.entry("wisconsin", "WI"),
            Map.entry("wyoming", "WY"),
            Map.entry("district of columbia", "DC"),
            Map.entry("american samoa", "AS"),
            Map.entry("guam", "GU"),
            Map.entry("northern mariana islands", "MP"),
            Map.entry("puerto rico", "PR"),
            Map.entry("virgin islands", "VI"),
            Map.entry("united states virgin islands", "VI"),
            Map.entry("u.s. virgin islands", "VI"));

    private static final Set<String> CODES = Set.copyOf(NAME_TO_CODE.values());

    private UsStates() {
    }

    /**
     * Full state name → USPS code; already-valid codes pass through uppercased;
     * anything unrecognized is returned as-is (never lossy).
     */
    static String toUspsCode(String state) {
        if (state == null || state.isBlank()) {
            return "";
        }
        String trimmed = state.trim();
        String code = NAME_TO_CODE.get(trimmed.toLowerCase(Locale.ROOT));
        if (code != null) {
            return code;
        }
        String upper = trimmed.toUpperCase(Locale.ROOT);
        return CODES.contains(upper) ? upper : trimmed;
    }
}
