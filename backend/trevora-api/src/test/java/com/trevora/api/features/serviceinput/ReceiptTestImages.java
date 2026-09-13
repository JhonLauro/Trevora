package com.trevora.api.features.serviceinput;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import javax.imageio.ImageIO;
import org.springframework.mock.web.MockMultipartFile;

/** Synthetic receipt photographs: generated text, never a real receipt or a real person. */
final class ReceiptTestImages {
    static final Color PAPER = new Color(0xF2EFE8);
    static final Color INK = new Color(0x1A1A1A);

    private static final String[] LINES = {
            "TOYOTA TALISAY SERVICE CENTER",
            "REPAIR ORDER NO. 0001234",
            "DATE 2026-08-11      ODO 45,210 KM",
            "",
            "CHANGE OIL AND FILTER      1,850.00",
            "BRAKE CLEANING               650.00",
            "AIR FILTER ELEMENT           980.00",
            "LABOR                      1,200.00",
            "VAT 12%                      561.60",
            "",
            "TOTAL                      5,241.60",
    };

    private ReceiptTestImages() {
    }

    static BufferedImage receipt(int width, int height) {
        return receipt(width, height, PAPER, INK, 0);
    }

    /** Rows of monospaced text, turned by {@code tiltDegrees} about the centre. */
    static BufferedImage receipt(int width, int height, Color paper, Color ink, double tiltDegrees) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(paper);
        g.fillRect(0, 0, width, height);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.rotate(Math.toRadians(tiltDegrees), width / 2.0, height / 2.0);
        g.setColor(ink);
        int size = Math.max(8, width / 28);
        g.setFont(new Font(Font.MONOSPACED, Font.BOLD, size));
        double spacing = size * 1.7;
        int lines = (int) (height / spacing);
        for (int line = 0; line < lines; line++) {
            g.drawString(LINES[line % LINES.length], (int) (width * 0.08), (int) (size * 1.5 + line * spacing));
        }
        g.dispose();
        return image;
    }

    /** Shrinks by {@code factor} and scales back up: a thorough, even blur. */
    static BufferedImage blurred(BufferedImage source, int factor) {
        int width = source.getWidth();
        int height = source.getHeight();
        BufferedImage small = new BufferedImage(Math.max(1, width / factor), Math.max(1, height / factor),
                BufferedImage.TYPE_INT_RGB);
        Graphics2D down = small.createGraphics();
        down.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        down.drawImage(source, 0, 0, small.getWidth(), small.getHeight(), null);
        down.dispose();
        BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D up = out.createGraphics();
        up.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        up.drawImage(small, 0, 0, width, height, null);
        up.dispose();
        return out;
    }

    static MockMultipartFile jpeg(String name, BufferedImage image) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "jpg", out);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
        return new MockMultipartFile("receiptImages", name, "image/jpeg", out.toByteArray());
    }
}
