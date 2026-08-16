package io.formsengine.service;

import org.springframework.stereotype.Component;

import java.io.InputStream;

/** The Phase-3 default {@link FileScanner}: accepts everything (FR3-22). */
@Component
public class NoOpFileScanner implements FileScanner {

    @Override
    public void scan(String fileName, String contentType, InputStream content) {
        // Intentionally empty — see FileScanner for the ClamAV integration point.
    }
}
