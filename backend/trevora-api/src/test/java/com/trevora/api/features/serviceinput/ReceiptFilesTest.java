package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.trevora.api.shared.exception.DeletionUnavailableException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClientException;

class ReceiptFilesTest {

    /** Records what would be sent to Storage, or fails the way Storage can. */
    static class RecordingFiles extends ReceiptFiles {
        final List<String> sent = new ArrayList<>();
        RestClientException failure;

        RecordingFiles(String url, String key) {
            super(url, key);
        }

        @Override
        protected void send(String bucket, List<String> paths) {
            if (failure != null) {
                throw failure;
            }
            sent.add(bucket + ":" + paths);
        }
    }

    private static ServiceDraft twoPageDraft() {
        ServiceDraft draft = new ServiceDraft();
        draft.setReceiptStoragePath("owner/vehicle/page-1.jpg");
        draft.setFieldMetadata(Map.of("storedReceiptPages", List.of(
                Map.of("bucket", "service-receipts", "path", "owner/vehicle/page-1.jpg"),
                Map.of("path", "owner/vehicle/page-2.jpg"))));
        return draft;
    }

    @Test
    void collectsEveryPageOnce() {
        assertThat(ReceiptFiles.of(twoPageDraft())).containsExactly(
                new ReceiptFiles.StoredReceipt("service-receipts", "owner/vehicle/page-1.jpg"),
                new ReceiptFiles.StoredReceipt("service-receipts", "owner/vehicle/page-2.jpg"));
    }

    @Test
    void somethingWithNoStoredFilesNeedsNoKey() {
        RecordingFiles files = new RecordingFiles("", "");

        files.removeOrRefuse(Set.of(), "record", "record 1");

        assertThat(files.sent).isEmpty();
    }

    @Test
    void refusesWithoutTheKeyAndSendsNothing() {
        RecordingFiles files = new RecordingFiles("https://project.supabase.co", "");

        DeletionUnavailableException refused = assertThrows(DeletionUnavailableException.class,
                () -> files.removeOrRefuse(ReceiptFiles.of(twoPageDraft()), "draft", "draft 1"));

        assertThat(refused.getMessage()).contains("nothing was removed").contains("Your draft is still here");
        assertThat(files.sent).isEmpty();
    }

    @Test
    void aStorageFailureRefusesTheDeletion() {
        RecordingFiles files = new RecordingFiles("https://project.supabase.co", "service-role-key");
        files.failure = new RestClientException("Storage answered 503");

        assertThrows(DeletionUnavailableException.class,
                () -> files.removeOrRefuse(ReceiptFiles.of(twoPageDraft()), "record", "record 1"));
    }

    @Test
    void removesEveryFileInOneRequestPerBucket() {
        RecordingFiles files = new RecordingFiles("https://project.supabase.co/", "service-role-key");

        files.removeOrRefuse(ReceiptFiles.of(twoPageDraft()), "draft", "draft 1");

        assertThat(files.sent).containsExactly(
                "service-receipts:[owner/vehicle/page-1.jpg, owner/vehicle/page-2.jpg]");
    }
}
