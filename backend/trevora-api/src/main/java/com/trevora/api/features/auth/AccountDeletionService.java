package com.trevora.api.features.auth;

import com.trevora.api.features.serviceinput.ReceiptFiles;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.shared.exception.DeletionUnavailableException;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Permanently deletes the signed-in owner's account.
 *
 * <p><b>How the deletion actually happens.</b> Only one row is deleted here:
 * the Supabase auth user. Migration 016 declared
 * {@code public.users.user_id -> auth.users.id ON DELETE CASCADE} and cascaded
 * the whole ownership tree beneath {@code users}, so removing that single row
 * takes the profile, the vehicles, the drafts, the confirmed records, their
 * line items, the share links, the access requests and the mechanic sessions
 * with it. There is no delete loop in this class because the database already
 * knows the shape of the tree, and a hand-written loop would only be a second,
 * staler copy of it.
 *
 * <p><b>Receipt files first, then the account.</b> Storage has no cascade. This
 * used to delete the auth user first and clean Storage afterwards, logging a
 * failure as a warning: the account was gone and its photos stayed, a silent
 * partial deletion. Now the files go first through {@link ReceiptFiles}; if
 * Storage refuses, nothing is deleted and the owner is told so. If the auth
 * deletion then fails, the account still exists with its photos already
 * removed, and trying again finishes it -- the harmless direction.
 *
 * <p><b>Mechanics are not deleted, and that is deliberate.</b> Mechanics never
 * register — {@code mechanic_id} is null on every row today, and 016 gave those
 * two columns ON DELETE SET NULL rather than CASCADE. Deleting an owner removes
 * the sessions they granted, which is what "the mechanics connected to that
 * account" actually means here; it does not reach into anyone else's data.
 *
 * <p><b>Why this refuses to run without a service-role key.</b> Deleting an
 * auth user and deleting storage objects are both admin operations, and the
 * anon key can do neither. Without the key the most this could manage is
 * emptying the app tables while leaving the Google login working and the
 * receipt images sitting in the bucket. That half-state is refused, loudly: an
 * error in the log, and a 503 that tells the owner nothing was removed.
 */
@Service
public class AccountDeletionService {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);

    private final CurrentUserService currentUserService;
    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceDraftRepository serviceDraftRepository;
    private final ReceiptFiles receiptFiles;
    private final String supabaseUrl;
    private final String serviceRoleKey;
    // Built on first use: constructing a client eagerly opens a socket in every
    // deployment, including the ones where nobody ever deletes an account.
    private RestClient restClient;

    public AccountDeletionService(
            CurrentUserService currentUserService,
            ServiceRecordRepository serviceRecordRepository,
            ServiceDraftRepository serviceDraftRepository,
            ReceiptFiles receiptFiles,
            @Value("${supabase.url:}") String supabaseUrl,
            @Value("${supabase.service-role-key:}") String serviceRoleKey
    ) {
        this.currentUserService = currentUserService;
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceDraftRepository = serviceDraftRepository;
        this.receiptFiles = receiptFiles;
        this.supabaseUrl = trimTrailingSlash(blankToNull(supabaseUrl));
        this.serviceRoleKey = blankToNull(serviceRoleKey);
    }

    @Transactional(readOnly = true)
    public AccountDeletionResponse deleteCurrentAccount() {
        if (supabaseUrl == null || serviceRoleKey == null) {
            log.error("Account deletion refused: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. "
                    + "Nothing was deleted.");
            throw new DeletionUnavailableException("account");
        }

        UUID userId = currentUserService.getCurrentUserId();

        /*
         * Read the receipt paths before anything is destroyed. After the auth
         * user goes, the rows that name these files are gone too, and the
         * objects would be unreachable rather than merely orphaned.
         */
        Set<ReceiptFiles.StoredReceipt> receipts = collectReceiptObjects(userId);
        receiptFiles.removeOrRefuse(receipts, "account", "account " + userId);

        deleteAuthUser(userId);
        log.info("Deleted account {} and its {} stored receipt file(s).", userId, receipts.size());
        return new AccountDeletionResponse(userId, receipts.size(), receipts.size(), true);
    }

    /**
     * Every storage object this owner put in the bucket, from confirmed records
     * and from drafts, which have usually uploaded their images already.
     */
    private Set<ReceiptFiles.StoredReceipt> collectReceiptObjects(UUID ownerId) {
        Set<ReceiptFiles.StoredReceipt> objects = new LinkedHashSet<>();
        for (ServiceRecord record : serviceRecordRepository.findByOwnerId(ownerId, Sort.unsorted())) {
            objects.addAll(ReceiptFiles.of(record));
        }
        for (ServiceDraft draft : serviceDraftRepository.findByOwnerId(ownerId)) {
            objects.addAll(ReceiptFiles.of(draft));
        }
        return objects;
    }

    private void deleteAuthUser(UUID userId) {
        try {
            restClient().method(org.springframework.http.HttpMethod.DELETE)
                    .uri(supabaseUrl + "/auth/v1/admin/users/" + userId)
                    .header("apikey", serviceRoleKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            /*
             * The receipt files are already gone, so "nothing was removed" would
             * not be true here. The account and its records still exist, and
             * trying again finishes the deletion.
             */
            log.error("Supabase rejected the account deletion for {} after its receipt files were removed: {}",
                    userId, exception.getMessage());
            throw DeletionUnavailableException.withMessage(
                    "Your account could not be deleted, and your records are still here. Some receipt photos "
                            + "may already have been removed. Try again to finish deleting the account.");
        }
    }

    private RestClient restClient() {
        RestClient existing = this.restClient;
        if (existing == null) {
            existing = RestClient.create();
            this.restClient = existing;
        }
        return existing;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String trimTrailingSlash(String value) {
        if (value == null) {
            return null;
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
