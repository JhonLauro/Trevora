package com.trevora.api.features.serviceinput;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Decides whether {@code 08.11.2026} is 11 August or 8 November.
 *
 * <p><b>Why this is code and not a prompt rule.</b> The receipt prompt says only
 * that dates should come back as {@code yyyy-MM-dd}. It never says which of the
 * two small numbers is the month, so the model picks one per call - and picks
 * differently on different calls. The JFTRUCK sales order in the golden set was
 * read as 2026-08-11 on one run and 2026-11-08 on the next, same image, same
 * code. Saying it in the prompt instead was considered and dropped: a prompt
 * rule is a preference the model can drop, and checking it costs a paid API run
 * that answers differently each time. This decides the same way on every run and
 * is checked against committed OCR text for nothing.
 *
 * <p><b>What the documents actually look like.</b> The JFTRUCK order prints its
 * date twice and neither printing settles anything:
 *
 * <pre>
 *   AAAA AAAA | Date : | 08.11.2026     &lt;- the service date
 *   08/11/2026 09:43:07                 &lt;- the system timestamp, equally mute
 * </pre>
 *
 * <p>Most receipts are kinder. A Toyota repair order prints {@code 04/30/2025}
 * with {@code 03/31/2028} alongside; 30 and 31 cannot be months, so that
 * document has declared itself month-first and every other date on it can be
 * read with confidence.
 *
 * <p><b>Four signals, tried strongest first.</b>
 * <ol>
 *   <li>A date printed with its month spelled out that matches one of the two
 *       readings. {@code APR 30 2025} cannot be misread.</li>
 *   <li>The document's own convention, taken from any other numeric date on it
 *       with a component above twelve.</li>
 *   <li>Elimination: a receipt is printed after the work, so a reading in the
 *       future is not a reading. This is what separates 11 August from 8
 *       November on the JFTRUCK order, which offers nothing else.</li>
 *   <li>Failing all three, month-first - every unambiguous date in the golden
 *       set is month-first, which is the Philippine norm. The owner is told
 *       this happened, because a coin-flip presented as a fact is worse than
 *       either face of it.</li>
 * </ol>
 *
 * <p>This never invents a date. When the extracted value has no second reading -
 * a day above twelve, a day equal to its month, or no matching numeric date
 * anywhere in the text - it is returned untouched and nothing is said.
 */
final class ServiceDateResolver {

    /**
     * @param date what to keep
     * @param ambiguous true when the document never said and the house rule chose
     * @param note what to tell the owner, or null when there is nothing to say
     */
    record Resolution(LocalDate date, boolean ambiguous, String note) {
    }

    /**
     * Three runs of digits joined by dots, slashes or hyphens.
     *
     * <p>The guards on either side do the real work. Without them the version
     * string {@code 2.0.2106.0} in the JFTRUCK footer reads as a date, and so
     * does any fragment of a longer dotted number.
     */
    private static final Pattern NUMERIC_DATE =
            Pattern.compile("(?<![\\d./-])(\\d{1,4})[./-](\\d{1,2})[./-](\\d{2,4})(?![\\d./-])");

    private static final List<String> MONTHS = List.of(
            "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec");

    private static final String MONTH_ALTERNATION = String.join("|", MONTHS);

    /** {@code APR 30 2025}, {@code September 22, 2020}. */
    private static final Pattern MONTH_THEN_DAY = Pattern.compile(
            "(?i)(?<![a-z])(" + MONTH_ALTERNATION + ")[a-z]*\\.?\\s*,?\\s*(\\d{1,2})\\s*,?\\s*(\\d{4})");

    /** {@code 30 APR 2025}, {@code 22-September-2020}. */
    private static final Pattern DAY_THEN_MONTH = Pattern.compile(
            "(?i)(?<![a-z0-9])(\\d{1,2})\\s*-?\\s*(" + MONTH_ALTERNATION + ")[a-z]*\\.?\\s*[-,]?\\s*(\\d{4})");

    private static final int EARLIEST_PLAUSIBLE_YEAR = 1990;
    private static final int LATEST_PLAUSIBLE_YEAR = 2100;

    /** The century a two-digit year belongs to. {@code 25} is 2025, not 1925. */
    private static final int TWO_DIGIT_YEAR_PIVOT = 70;

    /**
     * Spelled out on purpose: a note about a date nobody could read must not
     * itself be written in an order somebody has to guess at.
     */
    private static final DateTimeFormatter SPELLED =
            DateTimeFormatter.ofPattern("d MMMM uuuu", Locale.ENGLISH);

    private ServiceDateResolver() {
    }

    /**
     * @param ocrText the document as the layout reconstruction produced it
     * @param extracted what the model returned, which may be right already
     * @param today the day the receipt is being read, for the elimination rule
     * @return the date to keep, whether the document ever settled it, and what
     *     to tell the owner
     */
    static Resolution resolve(String ocrText, LocalDate extracted, LocalDate today) {
        if (extracted == null) {
            return new Resolution(null, false, null);
        }

        // A day above twelve has no second reading - the transposed month would
        // not exist - and a day equal to its month reads the same either way.
        int day = extracted.getDayOfMonth();
        int month = extracted.getMonthValue();
        if (day > 12 || day == month) {
            return keep(extracted);
        }

        List<Token> tokens = numericTokens(ocrText);
        Token source = sourceToken(tokens, extracted);
        if (source == null) {
            // The value did not come from a numeric date we can see: a spelled
            // month, an ISO date, or text that never reached us. Nothing to
            // transpose, and guessing at one would be inventing.
            return keep(extracted);
        }

        LocalDate monthFirst = date(source.year(), source.first(), source.second());
        LocalDate dayFirst = date(source.year(), source.second(), source.first());
        if (monthFirst == null || dayFirst == null || monthFirst.equals(dayFirst)) {
            return keep(extracted);
        }

        LocalDate spelled = spelledMatch(ocrText, monthFirst, dayFirst);
        if (spelled != null) {
            return settle(extracted, spelled, source,
                    "the same date is printed in words elsewhere on it");
        }

        Token witness = conventionWitness(tokens, source);
        if (witness != null) {
            boolean documentIsDayFirst = witness.first() > 12;
            LocalDate byConvention = documentIsDayFirst ? dayFirst : monthFirst;
            return settle(extracted, byConvention, source,
                    "this receipt prints " + (documentIsDayFirst ? "the day" : "the month")
                            + " first, going by \"" + witness.text() + "\" on the same page");
        }

        boolean monthFirstIsFuture = monthFirst.isAfter(today);
        boolean dayFirstIsFuture = dayFirst.isAfter(today);
        if (monthFirstIsFuture != dayFirstIsFuture) {
            LocalDate past = monthFirstIsFuture ? dayFirst : monthFirst;
            LocalDate future = monthFirstIsFuture ? monthFirst : dayFirst;
            return settle(extracted, past, source,
                    "the other reading, " + SPELLED.format(future)
                            + ", has not happened yet and a receipt is printed after the work");
        }

        /*
         * Nothing on the page decides it. Month-first is the house rule rather
         * than a fact about this receipt: every unambiguous date in the golden
         * set is month-first, and so is most Philippine printing. The owner is
         * told, because this is the one branch where the app does not know.
         */
        return new Resolution(monthFirst, true,
                "The date prints as \"" + source.text() + "\", which is either "
                        + SPELLED.format(monthFirst) + " or " + SPELLED.format(dayFirst)
                        + ", and nothing else on the receipt says which. Read as "
                        + SPELLED.format(monthFirst)
                        + " - change it if this shop writes the day first.");
    }

    private static Resolution keep(LocalDate extracted) {
        return new Resolution(extracted, false, null);
    }

    /**
     * Keeps {@code decided}, and says so only when it differs from what the
     * model returned. A value silently swapped for another is worse than either
     * value, because nobody can tell it happened.
     */
    private static Resolution settle(LocalDate extracted, LocalDate decided, Token source, String because) {
        if (decided.equals(extracted)) {
            return new Resolution(decided, false, null);
        }
        return new Resolution(decided, false,
                "The date prints as \"" + source.text() + "\" and was first read as "
                        + SPELLED.format(extracted) + ". Corrected to " + SPELLED.format(decided)
                        + " because " + because + ".");
    }

    /** A printed date, and the raw text it was printed as. */
    record Token(int first, int second, int year, String text) {
    }

    /**
     * Every {@code d/m/y}-shaped date on the page, in printed order.
     *
     * <p>Year-first dates are left out rather than reordered: {@code 2026-08-11}
     * is already unambiguous, and the OCR junk {@code 2026/85/21} is not a date
     * at all.
     */
    static List<Token> numericTokens(String ocrText) {
        if (ocrText == null || ocrText.isBlank()) {
            return List.of();
        }
        List<Token> tokens = new ArrayList<>();
        Matcher matcher = NUMERIC_DATE.matcher(ocrText);
        while (matcher.find()) {
            if (matcher.group(1).length() == 4) {
                continue;
            }
            int first = Integer.parseInt(matcher.group(1));
            int second = Integer.parseInt(matcher.group(2));
            Integer year = year(matcher.group(3));
            if (year == null || first < 1 || second < 1 || first > 31 || second > 31) {
                continue;
            }
            // Junk unless it is a date under at least one of the two readings.
            if (date(year, first, second) == null && date(year, second, first) == null) {
                continue;
            }
            tokens.add(new Token(first, second, year, matcher.group()));
        }
        return List.copyOf(tokens);
    }

    /**
     * The printing the extracted value came from: same year, and the same two
     * small numbers in some order.
     *
     * <p>Returns null when two printings disagree about that order, since then
     * there is no telling which one was read.
     */
    private static Token sourceToken(List<Token> tokens, LocalDate extracted) {
        Token found = null;
        for (Token token : tokens) {
            if (token.year() != extracted.getYear() || token.first() == token.second()) {
                continue;
            }
            boolean sameNumbers =
                    (token.first() == extracted.getMonthValue()
                            && token.second() == extracted.getDayOfMonth())
                            || (token.first() == extracted.getDayOfMonth()
                                    && token.second() == extracted.getMonthValue());
            if (!sameNumbers) {
                continue;
            }
            if (found != null && (found.first() != token.first() || found.second() != token.second())) {
                return null;
            }
            found = token;
        }
        return found;
    }

    /**
     * Another date on the page that declares the document's order by having a
     * component above twelve.
     *
     * <p>Null when the page offers none, or when two of them disagree - a
     * receipt printing both {@code 31/03/2028} and {@code 03/31/2028} is telling
     * us nothing, and taking the first would be taking one at random.
     */
    private static Token conventionWitness(List<Token> tokens, Token source) {
        Token witness = null;
        for (Token token : tokens) {
            if (token == source) {
                continue;
            }
            boolean saysDayFirst = token.first() > 12 && token.second() <= 12;
            boolean saysMonthFirst = token.second() > 12 && token.first() <= 12;
            if (!saysDayFirst && !saysMonthFirst) {
                continue;
            }
            if (witness != null && (witness.first() > 12) != saysDayFirst) {
                return null;
            }
            if (witness == null) {
                witness = token;
            }
        }
        return witness;
    }

    /** Whichever reading is also printed somewhere with its month in words. */
    private static LocalDate spelledMatch(String ocrText, LocalDate monthFirst, LocalDate dayFirst) {
        for (LocalDate spelled : spelledDates(ocrText)) {
            if (spelled.equals(monthFirst)) {
                return monthFirst;
            }
            if (spelled.equals(dayFirst)) {
                return dayFirst;
            }
        }
        return null;
    }

    static List<LocalDate> spelledDates(String ocrText) {
        if (ocrText == null || ocrText.isBlank()) {
            return List.of();
        }
        List<LocalDate> dates = new ArrayList<>();
        Matcher monthThenDay = MONTH_THEN_DAY.matcher(ocrText);
        while (monthThenDay.find()) {
            add(dates, monthThenDay.group(3), monthThenDay.group(1), monthThenDay.group(2));
        }
        Matcher dayThenMonth = DAY_THEN_MONTH.matcher(ocrText);
        while (dayThenMonth.find()) {
            add(dates, dayThenMonth.group(3), dayThenMonth.group(2), dayThenMonth.group(1));
        }
        return List.copyOf(dates);
    }

    private static void add(List<LocalDate> dates, String year, String monthName, String day) {
        Integer parsedYear = year(year);
        if (parsedYear == null) {
            return;
        }
        int month = MONTHS.indexOf(monthName.toLowerCase(Locale.ROOT).substring(0, 3)) + 1;
        LocalDate date = date(parsedYear, month, Integer.parseInt(day));
        if (date != null) {
            dates.add(date);
        }
    }

    private static Integer year(String raw) {
        int value = Integer.parseInt(raw);
        if (raw.length() <= 2) {
            value += value < TWO_DIGIT_YEAR_PIVOT ? 2000 : 1900;
        }
        return value >= EARLIEST_PLAUSIBLE_YEAR && value <= LATEST_PLAUSIBLE_YEAR ? value : null;
    }

    private static LocalDate date(int year, int month, int day) {
        try {
            return LocalDate.of(year, month, day);
        } catch (DateTimeException exception) {
            return null;
        }
    }
}
