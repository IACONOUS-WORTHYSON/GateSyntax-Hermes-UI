"""Fluent builder API — mirrors GateSyntax.GateSyntaxBuilder.cs"""
from __future__ import annotations
from pathlib import Path
from typing import Callable, TYPE_CHECKING

from runtime import (
    SyntaxParser, StateStore, StateDecl,
    PersistenceService, UIRuntime, GateSyntaxApp,
)

if TYPE_CHECKING:
    pass


class GateSyntaxBuilder:
    """
    Fluent entry-point for building a GateSyntax-powered PyQt application.

    Usage::

        GateSyntaxBuilder.from_directory("UI").build().run()

        # or full control:
        app, state = (
            GateSyntaxBuilder()
            .add_directory("UI")
            .register_action("QUIT", lambda: None)
            .build_with_state()
        )
        app.run()
    """

    def __init__(self) -> None:
        self._sources: list[tuple[str, str]] = []   # (content, name)
        self._custom_actions: list[tuple[str, Callable]] = []
        self._enable_persistence: bool = True
        self._css_path: str | None = None
        self._configure_fn: Callable[[StateStore], None] | None = None

    # ── Source loading ────────────────────────────────────────────────────────

    def add_file(self, path: str) -> "GateSyntaxBuilder":
        p = Path(path)
        self._sources.append((p.read_text(encoding="utf-8"), p.name))
        return self

    def add_directory(self, path: str,
                      main_first: bool = True) -> "GateSyntaxBuilder":
        d = Path(path)
        if not d.exists():
            raise FileNotFoundError(f"UI directory not found: {path}")
        files = list(d.glob("*.ui"))
        if main_first:
            main = next((f for f in files if f.name.lower() == "main.ui"), None)
            if main:
                self.add_file(str(main))
            for f in sorted(f for f in files if f.name.lower() != "main.ui"):
                self.add_file(str(f))
        else:
            for f in sorted(files):
                self.add_file(str(f))
        return self

    def add_content(self, ui_content: str,
                    name: str = "inline.ui") -> "GateSyntaxBuilder":
        self._sources.append((ui_content, name))
        return self

    # ── Options ───────────────────────────────────────────────────────────────

    def register_action(self, name: str,
                        action: Callable) -> "GateSyntaxBuilder":
        self._custom_actions.append((name, action))
        return self

    def with_persistence(self, enable: bool = True) -> "GateSyntaxBuilder":
        self._enable_persistence = enable
        return self

    def with_css(self, path: str) -> "GateSyntaxBuilder":
        self._css_path = path
        return self

    def configure(self, fn: Callable[[StateStore], None]) -> "GateSyntaxBuilder":
        self._configure_fn = fn
        return self

    # ── Build ─────────────────────────────────────────────────────────────────

    def build(self) -> GateSyntaxApp:
        return self.build_with_state()[0]

    def build_with_state(self) -> tuple[GateSyntaxApp, StateStore]:
        store = StateStore()
        persistence: PersistenceService | None = None
        if self._enable_persistence:
            persistence = PersistenceService(store)
            persistence.restore()

        if self._configure_fn:
            self._configure_fn(store)

        parser = SyntaxParser()
        nodes = []
        for content, name in self._sources:
            nodes.extend(parser.parse_content(content, name))

        for n in nodes:
            if isinstance(n, StateDecl):
                store.set_default(n.name, n.default_value)

        runtime = UIRuntime(nodes, store)
        for name, action in self._custom_actions:
            runtime.register_action(name, action)

        app = GateSyntaxApp(runtime, css_path=self._css_path)

        if persistence:
            persistence.register_nodes(nodes)

            original_run = app.run

            def run_with_save(**kwargs):
                try:
                    return original_run(**kwargs)
                finally:
                    persistence.save()

            app.run = run_with_save  # type: ignore[method-assign]

        return app, store

    # ── Static factories ──────────────────────────────────────────────────────

    @staticmethod
    def from_directory(path: str) -> "GateSyntaxBuilder":
        return GateSyntaxBuilder().add_directory(path)

    @staticmethod
    def from_file(path: str) -> "GateSyntaxBuilder":
        return GateSyntaxBuilder().add_file(path)

    @staticmethod
    def from_content(content: str) -> "GateSyntaxBuilder":
        return GateSyntaxBuilder().add_content(content)
