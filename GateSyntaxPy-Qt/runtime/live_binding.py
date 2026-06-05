"""Live binding helpers — mirrors GateSyntax.Runtime.LiveBinding.cs"""
from __future__ import annotations
from .syntax_node import ValueExpr, LiteralExpr, RefExpr, BinaryExpr


def collect_refs(expr: ValueExpr) -> list[str]:
    """Recursively collect all [VAR] references from a ValueExpr tree."""
    match expr:
        case RefExpr(var_name):
            return [var_name]
        case BinaryExpr(left, _, right):
            return collect_refs(left) + collect_refs(right)
        case _:
            return []
