package com.trevora.api.features.serviceinput;

import java.util.List;

/**
 * The quality gate stopped a receipt upload before any page was sent to OCR.
 *
 * <p>Carries every failing page and its problem, not just the first, so the
 * receipt screen can mark them all at once instead of one retake at a time.
 * Answered with 422 and a code per page; see {@code GlobalExceptionHandler}.
 * Nothing was read, so the owner can resend the same pages with
 * {@code readAnyway} and they are read as they are.
 */
public class ReceiptQualityException extends RuntimeException {

    public record PageIssue(int pageNumber, ReceiptQualityIssue issue) {
    }

    private final List<PageIssue> pages;

    public ReceiptQualityException(List<PageIssue> pages) {
        super(messageFor(pages));
        if (pages == null || pages.isEmpty()) {
            throw new IllegalArgumentException("A quality refusal needs at least one page.");
        }
        this.pages = List.copyOf(pages);
    }

    public List<PageIssue> pages() {
        return pages;
    }

    /** The first page's code, for callers that only read one. */
    public String code() {
        return pages.get(0).issue().code();
    }

    private static String messageFor(List<PageIssue> pages) {
        StringBuilder message = new StringBuilder();
        if (pages != null) {
            for (PageIssue page : pages) {
                message.append("Page ").append(page.pageNumber()).append(' ')
                        .append(describe(page.issue())).append(". ");
            }
        }
        return message.append("Retake those pages for a better read, or read them anyway.").toString();
    }

    private static String describe(ReceiptQualityIssue issue) {
        return switch (issue) {
            case LOW_RESOLUTION -> "is too small to read - move closer";
            case POOR_LIGHTING -> "is too dark or has glare - find even light";
            case BLURRY -> "looks blurry - hold steady";
            case MISALIGNED -> "is too tilted - straighten the receipt";
        };
    }
}
