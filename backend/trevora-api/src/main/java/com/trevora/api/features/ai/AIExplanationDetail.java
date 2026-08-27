package com.trevora.api.features.ai;

import java.util.List;

/**
 * One labelled group of facts in an explanation — "Parts noted", "Work
 * performed", "Total recorded cost" — with its values kept as a list.
 *
 * <p>These used to be concatenated into {@code whatWasDone}: a single string
 * reading "…at Toyota Otis. Parts noted: JLLY SYNTHETIC ENGINE OIL; OIL
 * FILTER; DRAIN PLUG WASHER; … Total recorded cost: PHP 7,850." The web app
 * then split that back apart to display it, which meant a presentation
 * concern was being solved by parsing prose the server had just assembled —
 * and it went wrong twice, first on the delimiter and then on a shop name
 * containing a comma.
 *
 * <p>A single-valued group is a one-element list rather than a separate
 * shape, so a client renders every group the same way.
 */
public record AIExplanationDetail(
        String label,
        List<String> values
) {
}
