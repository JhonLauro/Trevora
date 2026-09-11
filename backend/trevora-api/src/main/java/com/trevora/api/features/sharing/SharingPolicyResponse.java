package com.trevora.api.features.sharing;

/** The sharing lifetimes, for screens that state them. See {@link SharingPolicy}. */
public record SharingPolicyResponse(long linkHours, long sessionHours) {
    public static SharingPolicyResponse current() {
        return new SharingPolicyResponse(
                SharingPolicy.LINK_LIFETIME.toHours(),
                SharingPolicy.SESSION_LIFETIME.toHours()
        );
    }
}
