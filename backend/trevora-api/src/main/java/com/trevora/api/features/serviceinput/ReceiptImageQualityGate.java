package com.trevora.api.features.serviceinput;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Looks at a receipt photograph before Google Vision is paid to read it.
 *
 * <p><b>Why.</b> A blurry, dark or tiny photo still costs a Vision call, then
 * an OpenAI extraction, and comes back as a draft full of guesses the owner has
 * to untangle. Telling them "hold steady and retake" before any of that is
 * cheaper for us and far better for them. The receipt screen warns first
 * (receiptImage.js); this is the server's own check, which a script or an old
 * tab cannot skip.
 *
 * <p><b>What it measures</b>, on small grayscale copies so a page costs
 * milliseconds on Render's shared CPU:
 * <ul>
 *   <li><b>resolution</b> -- the long edge as uploaded. Not the short edge: a
 *       thermal receipt is long and narrow, and the browser already fits every
 *       photo to 2000px on its long side, so a short-edge rule would stop
 *       receipts that read perfectly;</li>
 *   <li><b>lighting</b> -- mean and spread of the gray levels: too dark, washed
 *       out, or so flat that glare has erased the ink;</li>
 *   <li><b>sharpness</b> -- variance of the Laplacian on a 400px copy. The
 *       receipt screen computes the same number at the same size, so the screen
 *       and the server agree about which pages are blurry;</li>
 *   <li><b>tilt</b> -- the angle at which the dark pixels line up into rows (a
 *       projection profile), or unknown when there are no clear rows.</li>
 * </ul>
 *
 * <p><b>No deskewing.</b> Vision reads tilted text, and
 * {@link GoogleVisionOCRProvider#estimateSkew} straightens the word geometry
 * after OCR by up to about 25 degrees. Rotating the pixels first would
 * re-encode the photo for nothing, so tilt is only a reason to ask for a retake,
 * and only past where that straightening gives up.
 *
 * <p><b>It fails open.</b> Anything it cannot decode -- HEIC, a CMYK JPEG, a
 * corrupt file -- is reported unchecked and goes to OCR as before. Stopping a
 * page because this class could not open it would charge this class's failure
 * to the owner.
 *
 * <p>Plain Java on purpose. OpenCV would bring a large native library to a
 * 512 MB instance for four measurements that are a few loops each.
 */
@Service
public class ReceiptImageQualityGate {
    private static final Logger log = LoggerFactory.getLogger(ReceiptImageQualityGate.class);

    /** OFF: not looked at. SHADOW: measured and recorded, never stops a page. ENFORCE: stops. */
    public enum Mode { OFF, SHADOW, ENFORCE }

    /** The sharpness and lighting copy. Must match SHARPNESS_SAMPLE_EDGE in receiptImage.js. */
    static final int SAMPLE_EDGE = 400;
    /**
     * The largest edge decoded at all. Bigger photos are subsampled while they
     * are decoded, so a 12-megapixel page costs a few megabytes of heap rather
     * than forty.
     */
    static final int DECODE_EDGE = 1200;
    static final int SKEW_EDGE = 600;
    private static final double SKEW_SEARCH_DEGREES = 30;
    private static final double SKEW_COARSE_STEP = 1.0;
    private static final double SKEW_FINE_STEP = 0.2;
    /** The best angle must stand clearly above the typical one, or the page has no rows to speak of. */
    private static final double SKEW_MIN_CONFIDENCE = 1.3;
    private static final int SKEW_MAX_POINTS = 60_000;

    private final Mode mode;
    private final int minLongEdge;
    private final double minSharpness;
    private final double minBrightness;
    private final double maxBrightness;
    private final double minContrast;
    private final double maxSkewDegrees;

    public ReceiptImageQualityGate(
            @Value("${trevora.receipt.quality-gate.mode:enforce}") String mode,
            @Value("${trevora.receipt.quality-gate.min-long-edge:800}") int minLongEdge,
            @Value("${trevora.receipt.quality-gate.min-sharpness:45}") double minSharpness,
            @Value("${trevora.receipt.quality-gate.min-brightness:50}") double minBrightness,
            @Value("${trevora.receipt.quality-gate.max-brightness:245}") double maxBrightness,
            @Value("${trevora.receipt.quality-gate.min-contrast:15}") double minContrast,
            @Value("${trevora.receipt.quality-gate.max-skew-degrees:20}") double maxSkewDegrees
    ) {
        this.mode = parseMode(mode);
        this.minLongEdge = minLongEdge;
        this.minSharpness = minSharpness;
        this.minBrightness = minBrightness;
        this.maxBrightness = maxBrightness;
        this.minContrast = minContrast;
        this.maxSkewDegrees = maxSkewDegrees;
    }

    /** A gate that looks at nothing -- for tests and the golden-set harness. */
    public static ReceiptImageQualityGate off() {
        return new ReceiptImageQualityGate("off", 800, 45, 50, 245, 15, 20);
    }

    public Mode mode() {
        return mode;
    }

    /** Measures one uploaded page. Never throws. */
    public ReceiptQualityReport assess(MultipartFile file) {
        try (InputStream input = file.getInputStream();
             ImageInputStream stream = new MemoryCacheImageInputStream(input)) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) {
                return ReceiptQualityReport.unchecked();
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                int step = Math.max(1, Math.max(width, height) / DECODE_EDGE);
                ImageReadParam param = reader.getDefaultReadParam();
                param.setSourceSubsampling(step, step, 0, 0);
                BufferedImage decoded = reader.read(0, param);
                return decoded == null ? ReceiptQualityReport.unchecked() : assess(decoded, width, height);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException unreadable) {
            return ReceiptQualityReport.unchecked();
        }
    }

    /**
     * Measures a decoded image.
     *
     * @param width  the page's width as uploaded, which may be larger than the
     *               decoded image when it was subsampled while decoding
     * @param height likewise
     */
    ReceiptQualityReport assess(BufferedImage image, int width, int height) {
        Gray sample = Gray.of(image, SAMPLE_EDGE);
        double sharpness = laplacianVariance(sample);
        double[] levels = meanAndStd(sample.pixels());
        Double skew = estimateSkewDegrees(Gray.of(image, SKEW_EDGE));

        // Added in ReceiptQualityIssue's order: most fundamental first.
        List<ReceiptQualityIssue> issues = new ArrayList<>();
        if (Math.max(width, height) < minLongEdge) {
            issues.add(ReceiptQualityIssue.LOW_RESOLUTION);
        }
        if (levels[0] < minBrightness || levels[0] > maxBrightness || levels[1] < minContrast) {
            issues.add(ReceiptQualityIssue.POOR_LIGHTING);
        }
        if (sharpness < minSharpness) {
            issues.add(ReceiptQualityIssue.BLURRY);
        }
        if (skew != null && Math.abs(skew) > maxSkewDegrees) {
            issues.add(ReceiptQualityIssue.MISALIGNED);
        }
        return new ReceiptQualityReport(true, width, height, sharpness, levels[0], levels[1], skew, issues);
    }

    /**
     * The same measure receiptImage.js takes: a 4-neighbour Laplacian over the
     * interior, and the variance of its response. A sharp page has strong,
     * varied edges; a blurred one has almost none.
     */
    static double laplacianVariance(Gray gray) {
        int w = gray.width();
        int h = gray.height();
        double[] p = gray.pixels();
        double sum = 0;
        double sumSq = 0;
        long count = 0;
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int i = y * w + x;
                double laplacian = p[i - 1] + p[i + 1] + p[i - w] + p[i + w] - 4 * p[i];
                sum += laplacian;
                sumSq += laplacian * laplacian;
                count++;
            }
        }
        if (count == 0) {
            return 0;
        }
        double mean = sum / count;
        return sumSq / count - mean * mean;
    }

    static double[] meanAndStd(double[] pixels) {
        if (pixels.length == 0) {
            return new double[] {0, 0};
        }
        double sum = 0;
        double sumSq = 0;
        for (double value : pixels) {
            sum += value;
            sumSq += value * value;
        }
        double mean = sum / pixels.length;
        return new double[] {mean, Math.sqrt(Math.max(0, sumSq / pixels.length - mean * mean))};
    }

    /**
     * The tilt of the printed rows, in degrees, or null when the page does not
     * show clear rows.
     *
     * <p>Every clearly dark pixel is projected onto the vertical axis of a page
     * turned by a candidate angle. At the angle the rows really run at, the ink
     * piles into narrow bands and the profile is spiky; at any other angle it
     * smears flat. The spikiest angle wins -- but only if it is clearly spikier
     * than the typical angle, because a photo of a table, a hand or a crumpled
     * sheet has no rows and its "best" angle is noise.
     *
     * <p>Positive means the rows run downhill to the right.
     */
    Double estimateSkewDegrees(Gray gray) {
        int w = gray.width();
        int h = gray.height();
        double[] pixels = gray.pixels();
        double[] levels = meanAndStd(pixels);
        if (levels[1] < 8) {
            return null;
        }
        double inkBelow = levels[0] - 0.8 * levels[1];

        int dark = 0;
        for (double value : pixels) {
            if (value < inkBelow) {
                dark++;
            }
        }
        long total = (long) w * h;
        if (dark < total * 0.002 || dark > total * 0.35) {
            return null;
        }

        int stride = Math.max(1, (int) Math.ceil((double) dark / SKEW_MAX_POINTS));
        int[] xs = new int[dark / stride + 1];
        int[] ys = new int[xs.length];
        int points = 0;
        int seen = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (pixels[y * w + x] < inkBelow) {
                    if (seen++ % stride == 0 && points < xs.length) {
                        xs[points] = x - w / 2;
                        ys[points] = y - h / 2;
                        points++;
                    }
                }
            }
        }

        int steps = (int) Math.round(2 * SKEW_SEARCH_DEGREES / SKEW_COARSE_STEP) + 1;
        double[] scores = new double[steps];
        double bestAngle = 0;
        double bestScore = -1;
        for (int i = 0; i < steps; i++) {
            double angle = -SKEW_SEARCH_DEGREES + i * SKEW_COARSE_STEP;
            scores[i] = profileScore(xs, ys, points, angle, w, h);
            if (scores[i] > bestScore) {
                bestScore = scores[i];
                bestAngle = angle;
            }
        }
        double[] sorted = scores.clone();
        Arrays.sort(sorted);
        double typical = sorted[sorted.length / 2];
        if (typical <= 0 || bestScore / typical < SKEW_MIN_CONFIDENCE) {
            return null;
        }

        double refinedAngle = bestAngle;
        double refinedScore = bestScore;
        for (double angle = bestAngle - SKEW_COARSE_STEP;
             angle <= bestAngle + SKEW_COARSE_STEP + 1e-9;
             angle += SKEW_FINE_STEP) {
            double score = profileScore(xs, ys, points, angle, w, h);
            if (score > refinedScore) {
                refinedScore = score;
                refinedAngle = angle;
            }
        }
        return refinedAngle;
    }

    private static double profileScore(int[] xs, int[] ys, int points, double degrees, int w, int h) {
        double radians = Math.toRadians(degrees);
        double sin = Math.sin(radians);
        double cos = Math.cos(radians);
        int offset = (int) Math.ceil(Math.hypot(w, h) / 2) + 2;
        int[] bins = new int[2 * offset + 1];
        for (int i = 0; i < points; i++) {
            int bin = (int) Math.round(ys[i] * cos - xs[i] * sin) + offset;
            if (bin >= 0 && bin < bins.length) {
                bins[bin]++;
            }
        }
        double score = 0;
        for (int count : bins) {
            score += (double) count * count;
        }
        return score;
    }

    private static Mode parseMode(String value) {
        if (value == null || value.isBlank()) {
            return Mode.ENFORCE;
        }
        try {
            return Mode.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            // A typo must not start stopping uploads, nor silently switch the gate off.
            log.warn("Unknown trevora.receipt.quality-gate.mode '{}'; measuring only (shadow).", value);
            return Mode.SHADOW;
        }
    }

    /**
     * A grayscale copy, box-averaged down to a long edge of at most {@code maxEdge}.
     * Same luma weights as receiptImage.js.
     */
    record Gray(double[] pixels, int width, int height) {
        static Gray of(BufferedImage image, int maxEdge) {
            int w = image.getWidth();
            int h = image.getHeight();
            double scale = Math.min(1.0, (double) maxEdge / Math.max(w, h));
            int targetWidth = Math.max(1, (int) Math.round(w * scale));
            int targetHeight = Math.max(1, (int) Math.round(h * scale));
            double[] sums = new double[targetWidth * targetHeight];
            int[] counts = new int[sums.length];
            int[] row = new int[w];
            for (int y = 0; y < h; y++) {
                image.getRGB(0, y, w, 1, row, 0, w);
                int ty = Math.min(targetHeight - 1, (int) ((long) y * targetHeight / h));
                for (int x = 0; x < w; x++) {
                    int tx = Math.min(targetWidth - 1, (int) ((long) x * targetWidth / w));
                    int rgb = row[x];
                    double luma = ((rgb >> 16) & 0xff) * 0.299 + ((rgb >> 8) & 0xff) * 0.587 + (rgb & 0xff) * 0.114;
                    sums[ty * targetWidth + tx] += luma;
                    counts[ty * targetWidth + tx]++;
                }
            }
            double[] pixels = new double[sums.length];
            for (int i = 0; i < sums.length; i++) {
                pixels[i] = counts[i] == 0 ? 0 : sums[i] / counts[i];
            }
            return new Gray(pixels, targetWidth, targetHeight);
        }
    }
}
