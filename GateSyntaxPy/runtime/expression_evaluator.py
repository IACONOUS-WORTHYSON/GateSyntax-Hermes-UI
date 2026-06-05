"""Expression evaluator — mirrors GateSyntax.Runtime.ExpressionEvaluator.cs"""
from __future__ import annotations
from typing import Any, TYPE_CHECKING

from .syntax_node import ValueExpr, LiteralExpr, RefExpr, BinaryExpr
from .syntax_parser import SyntaxParser

if TYPE_CHECKING:
    from .state_store import StateStore


class ExpressionEvaluator:
    def __init__(self, store: "StateStore") -> None:
        self._store = store

    def evaluate(self, expr: ValueExpr) -> Any:
        match expr:
            case LiteralExpr(value):
                return value
            case RefExpr(var_name):
                return self._store.get(var_name)
            case BinaryExpr(left, op, right):
                lv = self.evaluate(left)
                rv = self.evaluate(right)
                return self._apply_op(lv, op, rv)
            case _:
                return ""

    def evaluate_string(self, expr_str: str) -> Any:
        return self.evaluate(SyntaxParser.parse_value_expr(expr_str))

    @staticmethod
    def _apply_op(left: Any, op: str, right: Any) -> Any:
        if op == "+":
            if isinstance(left, str) or isinstance(right, str):
                return str(left) + str(right)
            return ExpressionEvaluator.to_double(left) + ExpressionEvaluator.to_double(right)
        if op == "-":
            return ExpressionEvaluator.to_double(left) - ExpressionEvaluator.to_double(right)
        if op.upper() in ("X", "*"):
            return ExpressionEvaluator.to_double(left) * ExpressionEvaluator.to_double(right)
        if op == "/":
            rv = ExpressionEvaluator.to_double(right)
            return ExpressionEvaluator.to_double(left) / rv if rv != 0 else 0.0
        return left

    @staticmethod
    def to_double(v: Any) -> float:
        if isinstance(v, (int, float)):
            return float(v)
        try:
            return float(str(v))
        except ValueError:
            return 0.0

    @staticmethod
    def to_bool(v: Any) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            return v != 0
        return str(v).upper() not in ("", "FALSE", "0", "NO")

    @staticmethod
    def to_str(v: Any) -> str:
        if isinstance(v, bool):
            return "True" if v else "False"
        if isinstance(v, float) and v == int(v):
            return str(int(v))
        return str(v)
