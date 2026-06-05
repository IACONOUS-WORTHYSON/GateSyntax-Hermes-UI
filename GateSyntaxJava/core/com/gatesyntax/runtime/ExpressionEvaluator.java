package com.gatesyntax.runtime;

import java.util.List;

/** Evaluates ValueExpr trees against a StateStore — mirrors GateSyntax.ExpressionEvaluator. */
public class ExpressionEvaluator {

    private final StateStore store;

    public ExpressionEvaluator(StateStore store) {
        this.store = store;
    }

    public Object evaluate(ValueExpr expr) {
        return switch (expr) {
            case LiteralExpr(var v)              -> v;
            case RefExpr(var name)               -> store.get(name);
            case BinaryExpr(var l, var op, var r) -> applyOp(evaluate(l), op, evaluate(r));
        };
    }

    public Object evaluateString(String s) {
        return evaluate(SyntaxParser.parseValueExpr(s));
    }

    private Object applyOp(Object l, String op, Object r) {
        return switch (op) {
            case "+" -> (l instanceof String || r instanceof String)
                    ? toStr(l) + toStr(r)
                    : toDouble(l) + toDouble(r);
            case "-"             -> toDouble(l) - toDouble(r);
            case "*"             -> toDouble(l) * toDouble(r);
            case "/"             -> { double rv = toDouble(r); yield rv != 0 ? toDouble(l) / rv : 0.0; }
            default              -> {
                if (op.equalsIgnoreCase("X")) yield toDouble(l) * toDouble(r);
                yield l;
            }
        };
    }

    // ── Static helpers ────────────────────────────────────────────────────────

    public static double toDouble(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(v)); } catch (NumberFormatException e) { return 0.0; }
    }

    public static boolean toBool(Object v) {
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n)  return n.doubleValue() != 0;
        return !List.of("", "false", "0", "no").contains(String.valueOf(v).toLowerCase());
    }

    public static String toStr(Object v) {
        if (v instanceof Boolean b) return b ? "True" : "False";
        if (v instanceof Double  d) return d == Math.floor(d) && !d.isInfinite()
                ? String.valueOf(d.longValue()) : String.valueOf(d);
        return v == null ? "" : String.valueOf(v);
    }
}
