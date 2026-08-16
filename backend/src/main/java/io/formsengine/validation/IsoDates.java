package io.formsengine.validation;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.regex.Pattern;

/**
 * ISO calendar-date validation shared by the DATE type module and the condition
 * value checks (Phase 2 §6.4, FR2-7). Dates are plain {@code YYYY-MM-DD} strings —
 * no time, no timezone, ever (Phase 2 §1.3).
 */
public final class IsoDates {

    private static final Pattern ISO_DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private IsoDates() {
    }

    /** True for a syntactically and calendrically valid {@code YYYY-MM-DD} date. */
    public static boolean isValid(String value) {
        if (value == null || !ISO_DATE.matcher(value).matches()) {
            return false;
        }
        try {
            LocalDate.parse(value);
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }
}
