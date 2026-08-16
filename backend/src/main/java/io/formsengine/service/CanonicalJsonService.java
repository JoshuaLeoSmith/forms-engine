package io.formsengine.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import io.formsengine.definition.Definition;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Canonical serialization and hashing of definitions (FR-E-15, BRD 10).
 *
 * <p>The canonical form serializes maps ordered by key and bean properties
 * alphabetically, so semantically identical definitions always produce the same
 * bytes and therefore the same SHA-256 hash ({@code draftHash} / {@code liveHash}).
 */
@Service
public class CanonicalJsonService {

    private final ObjectMapper canonicalMapper;

    public CanonicalJsonService() {
        this.canonicalMapper = JsonMapper.builder()
                .enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
                .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
                .build();
    }

    /** Canonical JSON bytes of a definition; also used for the NFR-4 1 MB size cap. */
    public byte[] canonicalBytes(Definition definition) {
        try {
            return canonicalMapper.writeValueAsBytes(definition);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to serialize definition", e);
        }
    }

    /** SHA-256 hex digest of the canonical JSON of a definition. */
    public String sha256Hex(Definition definition) {
        return sha256Hex(canonicalBytes(definition));
    }

    private static String sha256Hex(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(bytes);
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    /** Serialized UTF-8 byte length of an arbitrary value (used for answer caps, NFR-4). */
    public int utf8Length(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }
}
