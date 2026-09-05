package com.trevora.api.features.concern;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * What the owner typed, and nothing else.
 *
 * <p>One field on purpose. This gets written at the service counter or at
 * eleven at night, and every extra control is a reason not to bother. There is
 * no category to pick, no severity to rate and no component to attach — see
 * {@link Concern} for why none of those may exist.
 *
 * <p>The length cap is a storage guard, not an editorial one. It is high enough
 * that nobody writing in good faith will meet it.
 */
public record ConcernRequest(
        @NotBlank(message = "Write what you noticed before saving.")
        @Size(max = 2000, message = "A concern can be at most 2000 characters.")
        String note
) {
}
