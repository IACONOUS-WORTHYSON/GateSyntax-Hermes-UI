package com.gatesyntax.runtime;

public record BinaryExpr(ValueExpr left, String op, ValueExpr right) implements ValueExpr {}
