package io.formsengine.web;

import java.util.List;

/**
 * Carries an HTTP status, a summary message and a list of detail errors,
 * rendered by {@link GlobalExceptionHandler} into the standard 4xx error shape
 * <code>{ "status", "message", "errors" }</code>. Phase 5 adds an optional
 * machine-readable {@code code} (e.g. {@code ALREADY_SUBMITTED}, FR5-6),
 * serialized only when present.
 */
public class ApiException extends RuntimeException {

    private final int status;
    private final List<String> errors;
    private final String code;

    public ApiException(int status, String message, List<String> errors) {
        this(status, message, errors, null);
    }

    public ApiException(int status, String message, List<String> errors, String code) {
        super(message);
        this.status = status;
        this.errors = errors == null ? List.of() : List.copyOf(errors);
        this.code = code;
    }

    public ApiException(int status, String message) {
        this(status, message, List.of());
    }

    public int getStatus() {
        return status;
    }

    public List<String> getErrors() {
        return errors;
    }

    public String getCode() {
        return code;
    }

    public static ApiException notFound(String message) {
        return new ApiException(404, message);
    }

    public static ApiException badRequest(String message, List<String> errors) {
        return new ApiException(400, message, errors);
    }

    public static ApiException badRequest(String message) {
        return new ApiException(400, message);
    }

    public static ApiException conflict(String message) {
        return new ApiException(409, message);
    }

    /** 409 with a machine-readable code the renderer can branch on (FR5-6). */
    public static ApiException conflict(String message, String code) {
        return new ApiException(409, message, List.of(), code);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(403, message);
    }
}
