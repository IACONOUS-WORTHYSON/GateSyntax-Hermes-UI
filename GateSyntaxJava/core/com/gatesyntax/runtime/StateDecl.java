package com.gatesyntax.runtime;

public record StateDecl(String name, Object defaultValue, boolean saved) implements SyntaxNode {}
