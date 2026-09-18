package com.trevora.api.features.serviceinput;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Whether what OCR read off a page could be a receipt at all.
 *
 * <p>A selfie, a photo of the car or a T-shirt is sharp and well lit, so it
 * passes every check on the pixels, costs a Vision call, and used to go on to
 * the AI extraction as well -- which then returned an empty draft the owner had
 * to throw away. This looks at the text Vision found, before that second call:
 * <ul>
 *   <li>{@link ReceiptQualityIssue#NO_TEXT} -- fewer than {@value #MIN_WORDS}
 *       words. Vision found nothing on a face, a landscape or a floor, and two
 *       words on a car (its plate);</li>
 *   <li>{@link ReceiptQualityIssue#NO_DOCUMENT} -- words, but none of what every
 *       receipt, invoice, job order or parts slip carries: not one amount, not
 *       one date, and fewer than two receipt words. That is a T-shirt's slogan
 *       or a letter.</li>
 * </ul>
 *
 * <p>Deliberately generous. Any single amount or date is enough, whole-peso
 * amounts count when they are grouped ("1,350"), and the owner can always read
 * a flagged page anyway. Against 291 readable test receipts it flagged none,
 * including a small-shop receipt with only whole-peso prices; see
 * planning/DEFERRED.md, "Receipt quality gate calibrated against Vision".
 */
final class ReceiptTextCheck {
    static final int MIN_WORDS = 3;

    private static final Pattern MONEY = Pattern.compile(
            "(?<![\\d.])(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}(?!\\d)"   // 250.00, 1,980.00
                    + "|(?<![\\d,.])\\d{1,3}(?:,\\d{3})+(?![\\d,])"          // 1,350 in whole pesos
                    + "|\\b(?:PHP|P)\\s?\\d|₱\\s?\\d");                  // PHP 450, P450, a peso sign

    private static final Pattern DATE = Pattern.compile(
            "\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b"
                    + "|\\b\\d{4}-\\d{2}-\\d{2}\\b"
                    + "|\\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\\.?\\s+\\d{1,2},?\\s+\\d{2,4}\\b",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern RECEIPT_WORD = Pattern.compile(
            "\\b(?:TOTAL|AMOUNT|QTY|PHP|INVOICE|RECEIPT|SALES|CASH|CHANGE|VAT|TIN|LABOR|LABOUR|PARTS|SERVICE"
                    + "|REPAIR|JOB ORDER|ODOMETER|MILEAGE|PLATE|SUBTOTAL|DISCOUNT|UNIT|PRICE|PAID|BALANCE|ESTIMATE)\\b",
            Pattern.CASE_INSENSITIVE);

    private ReceiptTextCheck() {
    }

    /** The reason this page is not a receipt, or null when it could be one. */
    static ReceiptQualityIssue assess(String text) {
        if (text == null || text.isBlank() || text.trim().split("\\s+").length < MIN_WORDS) {
            return ReceiptQualityIssue.NO_TEXT;
        }
        if (MONEY.matcher(text).find() || DATE.matcher(text).find()) {
            return null;
        }
        Set<String> words = new HashSet<>();
        Matcher matcher = RECEIPT_WORD.matcher(text);
        while (matcher.find()) {
            words.add(matcher.group().toUpperCase(Locale.ROOT));
        }
        return words.size() >= 2 ? null : ReceiptQualityIssue.NO_DOCUMENT;
    }
}
