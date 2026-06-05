package com.gatesyntax.runtime;

import javafx.scene.canvas.Canvas;
import java.util.Map;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;

/** Ring-less rectangular gauge painted with Canvas. */
public class GaugeWidget extends Canvas {

    private double value    = 0;
    private double max      = 100;
    private String label    = "";
    private Color  fillColor = Color.web("#4499ff");

    private static final Color BG    = Color.web("#1a1a2e");
    private static final Color TRACK = Color.web("#2a2a3e");
    private static final Color TEXT  = Color.web("#cccccc");

    public GaugeWidget() {
        setWidth(200);
        setHeight(64);
        widthProperty().addListener(o -> draw());
        heightProperty().addListener(o -> draw());
    }

    // ── API ───────────────────────────────────────────────────────────────────

    public void setValue(double v)    { this.value = v; draw(); }
    public void setMax(double m)      { this.max = m;   draw(); }
    public void setLabel(String lbl)  { this.label = lbl; draw(); }
    public void setFillColor(String c){ this.fillColor = parseColor(c); draw(); }

    public double getValue() { return value; }
    public double getMax()   { return max; }

    // ── Painting ──────────────────────────────────────────────────────────────

    private void draw() {
        double w = getWidth(), h = getHeight();
        GraphicsContext gc = getGraphicsContext2D();
        gc.clearRect(0, 0, w, h);

        // Background
        gc.setFill(BG);
        gc.fillRect(0, 0, w, h);

        double y = 6;
        // Label
        if (!label.isEmpty()) {
            gc.setFill(TEXT);
            gc.setFont(Font.font("Segoe UI", FontWeight.BOLD, 11));
            gc.fillText(label, 8, y + 11);
            y += 20;
        }

        double mx   = 8;
        double barW = w - mx * 2;
        double barH = Math.max(10, h - y - 22);
        double pct  = Math.min(1.0, Math.max(0.0, value / Math.max(max, 1.0)));

        // Track (background bar)
        gc.setFill(TRACK);
        gc.fillRoundRect(mx, y, barW, barH, 6, 6);

        // Fill
        if (pct > 0) {
            gc.setFill(fillColor);
            gc.fillRoundRect(mx, y, barW * pct, barH, 6, 6);
        }

        // Value text
        gc.setFill(TEXT);
        gc.setFont(Font.font("Segoe UI", 10));
        String txt = String.format("%.0f / %.0f", value, max);
        gc.fillText(txt, w / 2 - 18, y + barH + 14);
    }

    // ── Color helper ──────────────────────────────────────────────────────────

    private static final java.util.Map<String, String> RICH = Map.of(
        "bright_blue",  "#4499ff", "bright_red",    "#ff5555",
        "bright_yellow","#ffd740", "bright_green",  "#55ee55",
        "bright_cyan",  "#55eeee", "bright_magenta","#ee55ee"
    );

    private static Color parseColor(String c) {
        String resolved = RICH.getOrDefault(c.toLowerCase().strip(), c);
        try { return Color.web(resolved); } catch (Exception e) { return Color.web("#4499ff"); }
    }
}
