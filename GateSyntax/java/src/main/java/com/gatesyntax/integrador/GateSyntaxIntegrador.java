// GateSyntaxIntegrador.java — Java / JavaFX
// Domain-agnostic GateSyntax integrador.
//
// Drop into any Java project that has GateSyntaxJava on the classpath.
// Reflects on @GsExpose-annotated members, auto-generates .ui declarations,
// and runs a live sync loop so the JavaFX UI always mirrors the host program.
//
// Usage:
//   GateSyntaxIntegrador.runFor(this);         // reflect + launch
//
// Or fluent:
//   GateSyntaxIntegrador.create()
//       .bind("speed",  () -> speed,  v -> speed = (double)v, 0, 200)
//       .action("Reset", () -> speed = 0)
//       .run();

package com.gatesyntax.integrador;

import com.gatesyntax.GateSyntaxApp;
import com.gatesyntax.GateSyntaxBuilder;
import com.gatesyntax.runtime.*;
import javafx.application.Application;
import javafx.application.Platform;

import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.*;

// ── Integrador ────────────────────────────────────────────────────────────────

public final class GateSyntaxIntegrador {

    // ── Binding descriptor ────────────────────────────────────────────────────

    private record Binding(
        String            name,
        String            label,
        Supplier<Object>  getter,
        Consumer<Object>  setter,
        Runnable          action,
        double            min,
        double            max,
        Class<?>          type
    ) {
        boolean isAction()  { return action != null; }
        boolean isNumeric() { return type == double.class || type == float.class
                                  || type == int.class    || type == long.class
                                  || Number.class.isAssignableFrom(type); }
        boolean isBool()    { return type == boolean.class || type == Boolean.class; }
    }

    // ── State ─────────────────────────────────────────────────────────────────

    private final List<Binding>          bindings  = new ArrayList<>();
    private       StateStore             store;
    private       ScheduledExecutorService ticker;
    private final double                 pollHz;

    public GateSyntaxIntegrador(double pollHz) { this.pollHz = pollHz; }

    // ── Fluent API ────────────────────────────────────────────────────────────

    public GateSyntaxIntegrador bind(String name, Supplier<Object> getter,
            Consumer<Object> setter, double min, double max) {
        return bind(name, name, getter, setter, min, max,
                    getter.get() != null ? getter.get().getClass() : String.class);
    }

    public GateSyntaxIntegrador bind(String name, String label,
            Supplier<Object> getter, Consumer<Object> setter,
            double min, double max, Class<?> type) {
        bindings.add(new Binding(name, label, getter, setter, null, min, max, type));
        return this;
    }

    public GateSyntaxIntegrador action(String name, Runnable fn) {
        return action(name, name, fn);
    }

    public GateSyntaxIntegrador action(String name, String label, Runnable fn) {
        bindings.add(new Binding(name, label, null, null, fn, 0, 100, Void.class));
        return this;
    }

    // ── Reflection discovery ──────────────────────────────────────────────────

    public static GateSyntaxIntegrador fromObject(Object host) {
        var ig = create();

        for (Field f : host.getClass().getDeclaredFields()) {
            var ann = f.getAnnotation(GsExpose.class);
            if (ann == null) continue;
            f.setAccessible(true);
            String label = ann.label().isEmpty() ? f.getName() : ann.label();
            ig.bind(f.getName(), label,
                () -> { try { return f.get(host); } catch (Exception e) { return null; } },
                v  -> { try { f.set(host, castTo(v, f.getType())); } catch (Exception ignored) {} },
                ann.min(), ann.max(), f.getType());
        }

        for (Method m : host.getClass().getDeclaredMethods()) {
            var ann = m.getAnnotation(GsExpose.class);
            if (ann == null || m.getParameterCount() > 0) continue;
            m.setAccessible(true);
            String label = ann.label().isEmpty() ? m.getName() : ann.label();
            ig.action(m.getName(), label, () -> {
                try { m.invoke(host); } catch (Exception ignored) {}
            });
        }

        return ig;
    }

    // ── .ui generation ────────────────────────────────────────────────────────

    private String generateUi() {
        var sb = new StringBuilder();
        sb.append("WINDOW Root :: TITLE \"GateSyntax Integrador\"\n");
        sb.append("SCROLL MainScroll :: IN [Root]\n");
        sb.append("COL    MainCol    :: IN [MainScroll]\n");

        for (var b : bindings) {
            String var_ = "GS_" + b.name().toUpperCase();

            if (b.isAction()) {
                sb.append("BUTTON ").append(b.name()).append("Btn :: IN [MainCol]")
                  .append(" :: LABEL \"▶  ").append(b.label()).append("\"")
                  .append(" :: ON CLICK /").append(var_).append("_CALL")
                  .append(" :: \"CALL_").append(b.name().toUpperCase()).append("\"\\\n");

            } else if (b.isNumeric()) {
                double init = b.getter() != null
                    ? ((Number) b.getter().get()).doubleValue() : b.min();
                sb.append("/").append(var_).append(" :: ").append(init).append("\\\n");
                sb.append("LABEL ").append(b.name()).append("Lbl :: IN [MainCol]")
                  .append(" :: TEXT \"").append(b.label()).append(":  \" + [").append(var_).append("]\n");
                sb.append("SLIDER ").append(b.name()).append("Sl :: IN [MainCol]")
                  .append(" :: MIN ").append(b.min()).append(" :: MAX ").append(b.max())
                  .append(" :: VALUE [").append(var_).append("]")
                  .append(" :: ON CHANGE /").append(var_).append(" :: [").append(b.name()).append("Sl]\\\n");
                sb.append("RULE ").append(b.name()).append("Sep :: IN [MainCol]\n");

            } else if (b.isBool()) {
                boolean init = b.getter() != null && Boolean.TRUE.equals(b.getter().get());
                sb.append("/").append(var_).append(" :: ").append(init ? "TRUE" : "FALSE").append("\\\n");
                sb.append("TOGGLE ").append(b.name()).append("Tog :: IN [MainCol]")
                  .append(" :: LABEL \"").append(b.label()).append("\"")
                  .append(" :: VALUE [").append(var_).append("]")
                  .append(" :: ON CHANGE /").append(var_).append(" :: [").append(b.name()).append("Tog]\\\n");

            } else {
                String init = b.getter() != null ? String.valueOf(b.getter().get()) : "";
                sb.append("/").append(var_).append(" :: \"").append(init).append("\"\\\n");
                sb.append("LABEL ").append(b.name()).append("Lbl :: IN [MainCol]")
                  .append(" :: TEXT \"").append(b.label()).append("\"\n");
                sb.append("INPUT ").append(b.name()).append("In :: IN [MainCol]")
                  .append(" :: HINT \"Enter ").append(b.label()).append("…\"")
                  .append(" :: ON CHANGE /").append(var_).append(" :: [").append(b.name()).append("In]\\\n");
            }
        }
        return sb.toString();
    }

    // ── Live poll loop ────────────────────────────────────────────────────────

    private void startLiveLoop() {
        long periodMs = (long) (1000.0 / pollHz);
        ticker = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "gs-integrador-poll");
            t.setDaemon(true);
            return t;
        });
        ticker.scheduleAtFixedRate(() -> {
            for (var b : bindings) {
                if (b.getter() == null) continue;
                try {
                    Object val = b.getter().get();
                    Platform.runLater(() -> store.set("GS_" + b.name().toUpperCase(), val));
                } catch (Exception ignored) {}
            }
        }, 0, periodMs, TimeUnit.MILLISECONDS);
    }

    // ── Entry point ───────────────────────────────────────────────────────────

    public void run() {
        String uiContent = generateUi();
        var builder = new GateSyntaxBuilder().addContent(uiContent);
        var runtime  = builder.buildRuntime();
        store = runtime.getStore();

        // UI → host: subscribe to state changes
        for (var b : bindings) {
            if (b.setter() == null) continue;
            String varName = "GS_" + b.name().toUpperCase();
            Consumer<Object> setter = b.setter();
            store.subscribe(varName, v -> {
                try { setter.accept(castTo(v, b.type())); } catch (Exception ignored) {}
            });
        }

        // Register action handlers
        for (var b : bindings) {
            if (!b.isAction()) continue;
            String key = "CALL_" + b.name().toUpperCase();
            Runnable fn = b.action();
            runtime.registerAction(key, fn);
        }

        // Start host → UI live poll
        startLiveLoop();

        // Launch JavaFX
        GateSyntaxApp.pendingBuilder = builder;
        Application.launch(GateSyntaxApp.class);

        ticker.shutdownNow();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Object castTo(Object v, Class<?> type) {
        if (v == null) return null;
        if (type == double.class || type == Double.class)  return ExpressionEvaluator.toDouble(v);
        if (type == float.class  || type == Float.class)   return (float) ExpressionEvaluator.toDouble(v);
        if (type == int.class    || type == Integer.class) return (int) ExpressionEvaluator.toDouble(v);
        if (type == long.class   || type == Long.class)    return (long) ExpressionEvaluator.toDouble(v);
        if (type == boolean.class|| type == Boolean.class) return ExpressionEvaluator.toBool(v);
        return ExpressionEvaluator.toStr(v);
    }

    private Supplier<Object> getter() { return null; } // unused placeholder

    // ── Static factories ──────────────────────────────────────────────────────

    public static GateSyntaxIntegrador create()               { return new GateSyntaxIntegrador(30); }
    public static GateSyntaxIntegrador create(double hz)      { return new GateSyntaxIntegrador(hz); }
    public static void                 runFor(Object host)    { fromObject(host).run(); }
}
