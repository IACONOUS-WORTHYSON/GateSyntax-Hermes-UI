package com.gatesyntax.runtime;

import java.util.List;

public record ElementDecl(
    String noun,
    String id,
    List<Property> props,
    List<Behavior> behaviors
) implements SyntaxNode {

    public java.util.Optional<Property> prop(String key) {
        return props.stream().filter(p -> p.key().equals(key)).findFirst();
    }
}
