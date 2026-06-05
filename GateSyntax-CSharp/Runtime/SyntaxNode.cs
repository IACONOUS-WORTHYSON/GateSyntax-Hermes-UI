using System.Collections.Generic;

namespace GateSyntax.Runtime;

// ── Value expressions ────────────────────────────────────────────────────────

public abstract record ValueExpr;
public sealed record LiteralExpr(object Value) : ValueExpr;
public sealed record RefExpr(string VarName) : ValueExpr;
public sealed record BinaryExpr(ValueExpr Left, string Op, ValueExpr Right) : ValueExpr;

// ── AST nodes ────────────────────────────────────────────────────────────────

public abstract record SyntaxNode;

public sealed record StateDecl(
    string Name,
    object DefaultValue,
    bool Saved) : SyntaxNode;

public sealed record Property(string Key, ValueExpr Value);

public sealed record Behavior(string Event, string TargetVar, string Expression);

public sealed record ElementDecl(
    string Noun,
    string Id,
    List<Property> Props,
    List<Behavior> Behaviors) : SyntaxNode;
