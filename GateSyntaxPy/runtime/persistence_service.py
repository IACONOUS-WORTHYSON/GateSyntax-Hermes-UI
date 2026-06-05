"""JSON persistence — mirrors GateSyntax.Runtime.PersistenceService.cs"""
from __future__ import annotations
import json
import os
from pathlib import Path
from typing import TYPE_CHECKING

from .syntax_node import StateDecl

if TYPE_CHECKING:
    from .state_store import StateStore


class PersistenceService:
    def __init__(self, store: "StateStore", app_name: str = "GateSyntaxPy") -> None:
        self._store = store
        self._path = Path(os.environ.get("APPDATA", Path.home())) / app_name / "state.json"
        self._saved_names: list[str] = []

    def register_nodes(self, nodes: list) -> None:
        self._saved_names = [
            n.name for n in nodes
            if isinstance(n, StateDecl) and n.saved
        ]

    def restore(self) -> None:
        if not self._path.exists():
            return
        try:
            raw: dict = json.loads(self._path.read_text(encoding="utf-8"))
            self._store.restore(raw)
        except Exception:
            pass

    def save(self) -> None:
        if not self._saved_names:
            return
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            snap = self._store.snapshot(self._saved_names)
            self._path.write_text(json.dumps(snap), encoding="utf-8")
        except Exception:
            pass
