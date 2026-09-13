package com.trevora.api.features.serviceinput;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Says, before any owner tries, whether deletion can remove receipt files.
 *
 * <p>Without the service-role key every deletion that has receipt photos is
 * refused (see {@link ReceiptFiles}). Found only when an owner tries, it would
 * reach us as a complaint, so the server says so at every boot, as an error.
 * The app still starts: taking everything down because deletion is unavailable
 * is the wrong trade.
 *
 * <p><b>Nothing watches {@code /health/deletion}.</b> It exists so an uptime
 * monitor can alert on it, and no monitor is configured. Until one is, the boot
 * log line is the only notice.
 */
@RestController
public class DeletionReadiness {

    private static final Logger log = LoggerFactory.getLogger(DeletionReadiness.class);

    private final ReceiptFiles receiptFiles;

    public DeletionReadiness(ReceiptFiles receiptFiles) {
        this.receiptFiles = receiptFiles;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void reportAtStartup() {
        if (!receiptFiles.available()) {
            log.error("Deletion is unavailable: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Deleting a "
                    + "record, draft, vehicle or account that has receipt photos will be refused until it is.");
        }
    }

    /** 200 when deletion can remove receipt files, 503 when it cannot. Deliberately separate from /health. */
    @GetMapping("/health/deletion")
    public ResponseEntity<Map<String, String>> health() {
        if (receiptFiles.available()) {
            return ResponseEntity.ok(Map.of("status", "AVAILABLE"));
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("status", "UNAVAILABLE", "reason", "Receipt file removal is not configured."));
    }
}
