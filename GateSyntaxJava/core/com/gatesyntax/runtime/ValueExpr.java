package com.gatesyntax.runtime;

/** Sealed hierarchy of value expressions — mirrors GateSyntax ValueExpr. */
public sealed interface ValueExpr permits LiteralExpr, RefExpr, BinaryExpr {}
