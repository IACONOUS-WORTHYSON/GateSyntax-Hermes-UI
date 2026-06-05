"""AST node types — mirrors GateSyntax.Runtime.SyntaxNode.cs"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


# ── Value expressions ────────────────────────────────────────────────────────

class ValueExpr:
    pass


@dataclass
class LiteralExpr(ValueExpr):
    value: Any


@dataclass
class RefExpr(ValueExpr):
    var_name: str


@dataclass
class BinaryExpr(ValueExpr):
    left: ValueExpr
    op: str
    right: ValueExpr


# ── Syntax nodes ─────────────────────────────────────────────────────────────

class SyntaxNode:
    pass


@dataclass
class StateDecl(SyntaxNode):
    name: str
    default_value: Any
    saved: bool = False


@dataclass
class Property:
    key: str
    value: ValueExpr


@dataclass
class Behavior:
    event: str
    target_var: str
    expression: str


@dataclass
class ElementDecl(SyntaxNode):
    noun: str
    id: str
    props: list[Property] = field(default_factory=list)
    behaviors: list[Behavior] = field(default_factory=list)
