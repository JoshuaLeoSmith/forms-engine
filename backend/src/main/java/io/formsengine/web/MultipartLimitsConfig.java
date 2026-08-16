package io.formsengine.web;

import jakarta.servlet.MultipartConfigElement;
import org.apache.coyote.http11.AbstractHttp11Protocol;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Multipart limits derived from the system cap (FR3-19): oversized bodies die
 * at the framework boundary — before touching handler code — as a
 * {@link org.springframework.web.multipart.MaxUploadSizeExceededException}
 * rendered as a clean 413. The request limit is one MB above the file limit to
 * leave room for the multipart boundary and the {@code questionCode} part. A
 * zero file-size threshold spools every part to disk, so upload handling never
 * grows the heap (NFR3-1).
 */
@Configuration
public class MultipartLimitsConfig {

    private static final long MB = 1024L * 1024L;

    @Bean
    public MultipartConfigElement multipartConfigElement(
            @Value("${forms.uploads.max-file-size-mb:50}") long maxFileSizeMb) {
        long maxFileBytes = maxFileSizeMb * MB;
        return new MultipartConfigElement("", maxFileBytes, maxFileBytes + MB, 0);
    }

    /**
     * Tomcat's default {@code maxSwallowSize} (2 MB) aborts the connection on
     * an over-limit body instead of letting the clean 413 reach the client.
     * Aligning it just above the request limit keeps the 413 deliverable for
     * bodies modestly over the cap, while wildly oversized bodies still get
     * cut off at the socket.
     */
    @Bean
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> multipartSwallowSizeCustomizer(
            @Value("${forms.uploads.max-file-size-mb:50}") long maxFileSizeMb) {
        long swallowBytes = Math.min(maxFileSizeMb * MB + 2 * MB, Integer.MAX_VALUE);
        return factory -> factory.addConnectorCustomizers(connector -> {
            if (connector.getProtocolHandler() instanceof AbstractHttp11Protocol<?> protocol) {
                protocol.setMaxSwallowSize((int) swallowBytes);
            }
        });
    }
}
