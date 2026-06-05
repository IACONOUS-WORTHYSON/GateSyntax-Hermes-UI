"""Line-oriented parser — mirrors GateSyntax.Runtime.SyntaxParser.cs"""
from __future__ import annotations
import re
from pathlib import Path
from .syntax_node import (
    SyntaxNode, StateDecl, ElementDecl, Property, Behavior,
    ValueExpr, LiteralExpr, RefExpr, BinaryExpr,
)

SEP = " :: "


class SyntaxParser:

    def parse_file(self, path: str) -> list[SyntaxNode]:
        text = Path(path).read_text(encoding="utf-8")
        return self.parse_content(text, Path(path).name)

    def parse_content(self, content: str, source_name: str = "inline.ui") -> list[SyntaxNode]:
        nodes: list[SyntaxNode] = []
        for raw in content.splitlines():
            line = raw.strip()
            if not line or line.startswith("//") or line.startswith("#"):
                continue
            node = self._parse_line(line)
            if node is not None:
                nodes.append(node)
        return nodes

    # ── Internal ─────────────────────────────────────────────────────────────

    def _parse_line(self, line: str) -> SyntaxNode | None:
        tokens = line.split(SEP)
        if not tokens:
            return None
        if tokens[0].lstrip().startswith("/"):
            return self._parse_state_decl(tokens)
        return self._parse_element_decl(tokens)

    @staticmethod
    def _parse_state_decl(tokens: list[str]) -> StateDecl:
        name = tokens[0].lstrip().lstrip("/").strip()
        default: object = ""
        if len(tokens) > 1:
            default = SyntaxParser._parse_literal(tokens[1].rstrip("\\").strip())
        saved = any(t.strip().upper() == "SAVED" for t in tokens[2:])
        return StateDecl(name, default, saved)

    @staticmethod
    def _parse_element_decl(tokens: list[str]) -> ElementDecl:
        first = tokens[0].strip()
        sp = first.find(" ")
        if sp < 0:
            noun, eid = first, first
        else:
            noun, eid = first[:sp], first[sp + 1:].strip()

        props: list[Property] = []
        behaviors: list[Behavior] = []

        i = 1
        while i < len(tokens):
            seg = tokens[i].strip()
            if seg.upper().startswith("ON "):
                parts = seg.split(None, 3)
                if len(parts) >= 3:
                    event_name = parts[1]
                    var_name = parts[2].lstrip("/").strip()
                    expr = ""
                    if i + 1 < len(tokens):
                        expr = tokens[i + 1].rstrip("\\").strip()
                        i += 1
                    behaviors.append(Behavior(event_name.upper(), var_name, expr))
                elif len(parts) == 2:
                    event_name = parts[1]
                    expr = ""
                    if i + 1 < len(tokens):
                        expr = tokens[i + 1].rstrip("\\").strip()
                        i += 1
                    behaviors.append(Behavior(event_name.upper(), "__noop__", expr))
            else:
                sp2 = seg.find(" ")
                if sp2 < 0:
                    props.append(Property(seg.upper(), LiteralExpr(True)))
                else:
                    key = seg[:sp2].upper()
                    val_str = seg[sp2 + 1:].strip()
                    props.append(Property(key, SyntaxParser.parse_value_expr(val_str)))
            i += 1

        return ElementDecl(noun.upper(), eid, props, behaviors)

    # ── Value expression parsing ─────────────────────────────────────────────

    @staticmethod
    def parse_value_expr(s: str) -> ValueExpr:
        s = s.strip()
        parts = SyntaxParser._tokenize_expr(s)
        if not parts:
            return LiteralExpr("")
        if len(parts) == 1:
            return SyntaxParser._parse_single_token(parts[0])
        left = SyntaxParser._parse_single_token(parts[0])
        idx = 1
        while idx < len(parts) - 1:
            op = parts[idx]
            right = SyntaxParser._parse_single_token(parts[idx + 1])
            left = BinaryExpr(left, op, right)
            idx += 2
        return left

    @staticmethod
    def _tokenize_expr(s: str) -> list[str]:
        result: list[str] = []
        buf: list[str] = []
        in_quote = False
        in_ref = False
        for ch in s:
            if ch == '"':
                in_quote = not in_quote
                buf.append(ch)
            elif ch == '[':
                in_ref = True
                buf.append(ch)
            elif ch == ']':
                in_ref = False
                buf.append(ch)
            elif ch == ' ' and not in_quote and not in_ref:
                if buf:
                    result.append("".join(buf))
                    buf.clear()
            else:
                buf.append(ch)
        if buf:
            result.append("".join(buf))
        return result

    @staticmethod
    def _parse_single_token(t: str) -> ValueExpr:
        t = t.strip()
        if t.startswith("[") and t.endswith("]"):
            return RefExpr(t[1:-1])
        return LiteralExpr(SyntaxParser._parse_literal(t))

    @staticmethod
    def _parse_literal(s: str) -> object:
        s = s.strip().rstrip("\\").strip()
        if s.startswith('"') and s.endswith('"'):
            return s[1:-1]
        if s.upper() == "TRUE":
            return True
        if s.upper() == "FALSE":
            return False
        try:
            return int(s)
        except ValueError:
            pass
        try:
            return float(s)
        except ValueError:
            pass
        return s
