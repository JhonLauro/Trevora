package com.trevora.api.features.auth;

import com.trevora.api.shared.exception.AuthException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Which in-app tips the signed-in owner has already been shown.
 *
 * <p>Two operations and no cleverness: list what they have seen, and record
 * one as seen. The decision about which tip to show, and when, is the
 * frontend's -- it is the only side that knows what is on screen.
 */
@Service
public class UserTipService {
    /**
     * Long enough for a descriptive key, short enough that the column is not a
     * place to put a paragraph. Keys come from our own registry, but this
     * endpoint is reachable by anyone signed in, and an unbounded text column
     * fed straight from a request body is a free write-anything store.
     */
    private static final int MAX_KEY_LENGTH = 100;

    private final UserTipSeenRepository userTipSeenRepository;
    private final CurrentUserService currentUserService;

    public UserTipService(
            UserTipSeenRepository userTipSeenRepository,
            CurrentUserService currentUserService
    ) {
        this.userTipSeenRepository = userTipSeenRepository;
        this.currentUserService = currentUserService;
    }

    public List<String> seenTipKeys() {
        UUID userId = currentUserService.getCurrentUserId();
        return userTipSeenRepository.findByUserId(userId).stream()
                .map(UserTipSeen::getTipKey)
                .toList();
    }

    /**
     * Records a tip as seen.
     *
     * <p>Idempotent. A dismissal can be reported twice -- a double tap, a
     * retried request -- and the second one must not be an error, because
     * there is nothing for the caller to do about it and the state it wanted
     * is already true.
     */
    public List<String> markTipSeen(String tipKey) {
        String key = tipKey == null ? "" : tipKey.trim();
        if (key.isEmpty()) {
            throw new AuthException("A tip key is required.");
        }
        if (key.length() > MAX_KEY_LENGTH) {
            throw new AuthException("That tip key is too long.");
        }

        UUID userId = currentUserService.getCurrentUserId();
        if (!userTipSeenRepository.existsById(new UserTipSeen.Key(userId, key))) {
            userTipSeenRepository.save(new UserTipSeen(userId, key, Instant.now()));
        }
        return seenTipKeys();
    }
}
