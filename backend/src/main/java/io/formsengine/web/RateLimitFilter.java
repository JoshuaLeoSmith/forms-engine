package io.formsengine.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Per-IP token bucket rate limiting for mutating public endpoints (NFR-3),
 * blunting junk-response flooding. Defaults: capacity 20, refill 10 tokens/s.
 * In-memory only — adequate for a single self-hosted instance.
 *
 * <p>The geocode proxy fans out to a third party, so {@code GET
 * /public/v1/geocode} gets its own, stricter bucket per IP (FR2-13).
 * Defaults: capacity 10, refill 2 tokens/s.
 *
 * <p>File uploads get a third, stricter-still bucket (Phase 3 FR3-25):
 * default 30 uploads / 10 min / IP (capacity 30, refill 0.05 tokens/s).
 * {@code POST …/responses/{id}/files} consumes only the upload bucket — never
 * the general mutating one — and its 429 carries a {@code Retry-After} header.
 *
 * <p>{@code GET …/ref-status} gets a fourth bucket (Phase 5 FR5-10), stricter
 * than the general one — it reveals a completion boolean per ref, so hammering
 * it for enumeration should hit 429 quickly. Defaults: capacity 10, refill
 * 1 token/s.
 *
 * <p>Configurable via {@code forms.rate-limit.enabled}, {@code forms.rate-limit.capacity},
 * {@code forms.rate-limit.refill-per-second}, {@code forms.rate-limit.geocode-capacity},
 * {@code forms.rate-limit.geocode-refill-per-second}, {@code forms.rate-limit.upload-capacity},
 * {@code forms.rate-limit.upload-refill-per-second}, {@code forms.rate-limit.ref-status-capacity}
 * and {@code forms.rate-limit.ref-status-refill-per-second}. Buckets idle for
 * more than 10 minutes are evicted opportunistically.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final long IDLE_EVICTION_NANOS = TimeUnit.MINUTES.toNanos(10);

    private final boolean enabled;
    private final int capacity;
    private final double refillPerSecond;
    private final int geocodeCapacity;
    private final double geocodeRefillPerSecond;
    private final int uploadCapacity;
    private final double uploadRefillPerSecond;
    private final int refStatusCapacity;
    private final double refStatusRefillPerSecond;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> geocodeBuckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> uploadBuckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> refStatusBuckets = new ConcurrentHashMap<>();

    public RateLimitFilter(@Value("${forms.rate-limit.enabled:true}") boolean enabled,
                           @Value("${forms.rate-limit.capacity:20}") int capacity,
                           @Value("${forms.rate-limit.refill-per-second:10}") double refillPerSecond,
                           @Value("${forms.rate-limit.geocode-capacity:10}") int geocodeCapacity,
                           @Value("${forms.rate-limit.geocode-refill-per-second:2}") double geocodeRefillPerSecond,
                           @Value("${forms.rate-limit.upload-capacity:30}") int uploadCapacity,
                           @Value("${forms.rate-limit.upload-refill-per-second:0.05}") double uploadRefillPerSecond,
                           @Value("${forms.rate-limit.ref-status-capacity:10}") int refStatusCapacity,
                           @Value("${forms.rate-limit.ref-status-refill-per-second:1}") double refStatusRefillPerSecond) {
        this.enabled = enabled;
        this.capacity = capacity;
        this.refillPerSecond = refillPerSecond;
        this.geocodeCapacity = geocodeCapacity;
        this.geocodeRefillPerSecond = geocodeRefillPerSecond;
        this.uploadCapacity = uploadCapacity;
        this.uploadRefillPerSecond = uploadRefillPerSecond;
        this.refStatusCapacity = refStatusCapacity;
        this.refStatusRefillPerSecond = refStatusRefillPerSecond;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!enabled) {
            return true;
        }
        return !(isMutatingPublic(request) || isGeocode(request) || isUpload(request) || isRefStatus(request));
    }

    /** General public mutating traffic — excluding upload POSTs, which have their own bucket (FR3-25). */
    private static boolean isMutatingPublic(HttpServletRequest request) {
        String method = request.getMethod();
        boolean mutating = "POST".equalsIgnoreCase(method) || "PATCH".equalsIgnoreCase(method)
                || "PUT".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method);
        return mutating && request.getRequestURI().startsWith("/public/v1/") && !isUpload(request);
    }

    private static boolean isGeocode(HttpServletRequest request) {
        return "GET".equalsIgnoreCase(request.getMethod())
                && request.getRequestURI().startsWith("/public/v1/geocode");
    }

    /** FR3-25: {@code POST /public/v1/responses/{id}/files}. */
    private static boolean isUpload(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return "POST".equalsIgnoreCase(request.getMethod())
                && uri.startsWith("/public/v1/responses/") && uri.endsWith("/files");
    }

    /** FR5-10: {@code GET /public/v1/questionnaires/{publicId}/ref-status}. */
    private static boolean isRefStatus(HttpServletRequest request) {
        return "GET".equalsIgnoreCase(request.getMethod())
                && request.getRequestURI().startsWith("/public/v1/questionnaires/")
                && request.getRequestURI().endsWith("/ref-status");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        long now = System.nanoTime();
        boolean geocode = isGeocode(request);
        boolean upload = isUpload(request);
        boolean refStatus = isRefStatus(request);
        ConcurrentHashMap<String, Bucket> bucketMap = upload ? uploadBuckets
                : geocode ? geocodeBuckets : refStatus ? refStatusBuckets : buckets;
        int bucketCapacity = upload ? uploadCapacity
                : geocode ? geocodeCapacity : refStatus ? refStatusCapacity : capacity;
        double bucketRefillPerSecond = upload ? uploadRefillPerSecond
                : geocode ? geocodeRefillPerSecond : refStatus ? refStatusRefillPerSecond : refillPerSecond;
        evictIdle(bucketMap, now);

        String ip = request.getRemoteAddr();
        Bucket bucket = bucketMap.computeIfAbsent(ip == null ? "unknown" : ip, k -> new Bucket(bucketCapacity, now));
        if (bucket.tryConsume(now, bucketCapacity, bucketRefillPerSecond)) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setStatus(429);
        if (upload) {
            // FR3-25: tell the renderer when the next upload slot opens up.
            response.setHeader("Retry-After",
                    Long.toString(bucket.secondsUntilNextToken(now, bucketCapacity, bucketRefillPerSecond)));
        }
        response.setContentType("application/json");
        response.getWriter().write("{\"status\":429,\"message\":\"too many requests\",\"errors\":[]}");
    }

    private static void evictIdle(ConcurrentHashMap<String, Bucket> bucketMap, long now) {
        bucketMap.entrySet().removeIf(e -> now - e.getValue().lastSeenNanos() > IDLE_EVICTION_NANOS);
    }

    /** A simple token bucket; all mutation happens under the bucket's own lock. */
    private static final class Bucket {
        private double tokens;
        private long lastRefillNanos;
        private volatile long lastSeen;

        Bucket(int capacity, long now) {
            this.tokens = capacity;
            this.lastRefillNanos = now;
            this.lastSeen = now;
        }

        synchronized boolean tryConsume(long now, int capacity, double refillPerSecond) {
            lastSeen = now;
            double elapsedSeconds = (now - lastRefillNanos) / 1_000_000_000.0;
            if (elapsedSeconds > 0) {
                tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
                lastRefillNanos = now;
            }
            if (tokens >= 1.0) {
                tokens -= 1.0;
                return true;
            }
            return false;
        }

        /** Seconds until a full token is available, rounded up (FR3-25 Retry-After). */
        synchronized long secondsUntilNextToken(long now, int capacity, double refillPerSecond) {
            if (refillPerSecond <= 0) {
                return TimeUnit.NANOSECONDS.toSeconds(IDLE_EVICTION_NANOS);
            }
            double elapsedSeconds = (now - lastRefillNanos) / 1_000_000_000.0;
            double current = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
            if (current >= 1.0) {
                return 1;
            }
            return (long) Math.ceil((1.0 - current) / refillPerSecond);
        }

        long lastSeenNanos() {
            return lastSeen;
        }
    }
}
