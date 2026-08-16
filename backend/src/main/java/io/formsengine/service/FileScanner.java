package io.formsengine.service;

import java.io.InputStream;

/**
 * Malware-scanning hook (FR3-22): invoked post-verification, pre-storage, for
 * every accepted upload. Deliberately a no-op in Phase 3 — explicitly out of
 * scope to implement, explicitly in scope to leave the socket. A deployment
 * that needs scanning replaces the {@link NoOpFileScanner} bean with one that
 * streams {@code content} to a scanner daemon — ClamAV's {@code clamd}
 * INSTREAM protocol (or its clammit/icap HTTP front ends) is the intended
 * integration; throw to veto the upload.
 */
public interface FileScanner {

    /**
     * Scans one upload. Implementations should throw (e.g. an
     * {@link io.formsengine.web.ApiException}) to reject the file; returning
     * normally accepts it.
     *
     * @param fileName    the sanitized file name (display only)
     * @param contentType the verified content type (FR3-21)
     * @param content     the file content stream; the caller closes it
     */
    void scan(String fileName, String contentType, InputStream content);
}
