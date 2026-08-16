package io.formsengine.validation;

/**
 * Tiny shared checks for {@code typeConfig} values, which arrive as untyped
 * JSON. Semantics mirror the renderer registry: {@link #isInteger} matches
 * JavaScript's {@code Number.isInteger} (so {@code 5.0} counts as an integer).
 */
final class TypeConfigs {

    private TypeConfigs() {
    }

    /** True when the value is a finite, integral JSON number. */
    static boolean isInteger(Object value) {
        if (!(value instanceof Number n)) {
            return false;
        }
        double d = n.doubleValue();
        return Double.isFinite(d) && d == Math.floor(d);
    }

    /** True when the value is a finite JSON number. */
    static boolean isFiniteNumber(Object value) {
        return value instanceof Number n && Double.isFinite(n.doubleValue());
    }
}
