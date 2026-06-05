package com.gatesyntax.runtime;

import java.util.ArrayList;
import java.util.List;

public final class LiveBinding {
    private LiveBinding() {}

    /** Collect all [VAR] references from a ValueExpr tree. */
    public static List<String> collectRefs(ValueExpr expr) {
        return switch (expr) {
            case RefExpr(var name)                -> List.of(name);
            case BinaryExpr(var l, var op, var r) -> { var refs = new ArrayList<String>(); refs.addAll(collectRefs(l)); refs.addAll(collectRefs(r)); yield List.copyOf(refs); }
            default                               -> List.of();
        };
    }
}
