package io.formsengine.validation;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * ADDRESS type module (Phase 2 §6.8): a fixed sub-field set with country, line1
 * and city always enabled; required implies enabled; {@code defaultCountry} is
 * null or a two-letter uppercase ISO 3166-1 alpha-2 code. Rule conditions
 * targeting an ADDRESS must name an enabled sub-field via {@code subField}
 * (FR2-6).
 */
@Component
public class AddressTypeValidator implements QuestionTypeValidator {

    /** Fixed sub-field set (§6.8.1). */
    public static final List<String> SUB_FIELDS = List.of("country", "line1", "line2", "city", "state", "postalCode");

    /** country, line1 and city are always enabled (§6.8.1). */
    public static final Set<String> ALWAYS_ENABLED = Set.of("country", "line1", "city");

    private static final Pattern COUNTRY_CODE = Pattern.compile("^[A-Z]{2}$");

    @Override
    public String type() {
        return "ADDRESS";
    }

    @Override
    public List<String> validateConfig(Map<String, Object> config) {
        List<String> problems = new ArrayList<>();
        Object enabledObj = config == null ? null : config.get("enabledFields");
        if (enabledObj != null && !(enabledObj instanceof Map)) {
            problems.add("ADDRESS typeConfig.enabledFields must be an object of booleans");
            return problems;
        }
        Object requiredObj = config == null ? null : config.get("requiredFields");
        if (requiredObj != null && !(requiredObj instanceof Map)) {
            problems.add("ADDRESS typeConfig.requiredFields must be an object of booleans");
            return problems;
        }
        Set<String> enabled = enabledSubFields(config);
        if (requiredObj instanceof Map<?, ?> requiredFields) {
            for (Map.Entry<?, ?> entry : requiredFields.entrySet()) {
                String field = String.valueOf(entry.getKey());
                if (!SUB_FIELDS.contains(field)) {
                    problems.add("ADDRESS typeConfig has unknown sub-field '" + field + "' in requiredFields");
                } else if (Boolean.TRUE.equals(entry.getValue()) && !enabled.contains(field)) {
                    problems.add("ADDRESS required sub-field '" + field + "' must also be enabled");
                }
            }
        }
        if (enabledObj instanceof Map<?, ?> enabledFields) {
            for (Object key : enabledFields.keySet()) {
                String field = String.valueOf(key);
                if (!SUB_FIELDS.contains(field)) {
                    problems.add("ADDRESS typeConfig has unknown sub-field '" + field + "' in enabledFields");
                }
            }
        }
        Object defaultCountry = config == null ? null : config.get("defaultCountry");
        if (defaultCountry != null
                && (!(defaultCountry instanceof String s) || !COUNTRY_CODE.matcher(s).matches())) {
            problems.add("ADDRESS typeConfig.defaultCountry must be null or a two-letter uppercase country code");
        }
        return problems;
    }

    /** The enabled sub-fields of a config: the always-enabled trio plus explicit opt-ins (§6.8.1). */
    public static Set<String> enabledSubFields(Map<String, Object> config) {
        Set<String> enabled = new LinkedHashSet<>();
        Object enabledObj = config == null ? null : config.get("enabledFields");
        for (String field : SUB_FIELDS) {
            if (ALWAYS_ENABLED.contains(field)
                    || (enabledObj instanceof Map<?, ?> enabledFields && Boolean.TRUE.equals(enabledFields.get(field)))) {
                enabled.add(field);
            }
        }
        return enabled;
    }

    @Override
    public ConditionValueKind conditionValueKind() {
        return ConditionValueKind.ADDRESS;
    }
}
