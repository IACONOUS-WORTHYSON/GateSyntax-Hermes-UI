"""
GateSyntax Integrador — Python
Domain-agnostic live-binding layer for GateSyntaxPy / GateSyntaxPy-Qt.

Drop into any Python program. Register state and callables; the integrador
auto-generates .ui declarations and opens a live GateSyntax UI that stays
in sync with the host program at a configurable poll rate.

Usage (decorator style):
    from gatesyntax_integrador import GateSyntaxIntegrador

    ig = GateSyntaxIntegrador()

    @ig.expose(min=0, max=200)
    def speed() -> float:
        return _speed                # getter

    @ig.expose_setter("speed")
    def set_speed(v: float):
        global _speed; _speed = v

    @ig.action(label="Reset")
    def reset():
        global _speed; _speed = 0

    ig.run()                         # blocks; opens the live UI

Usage (object reflection):
    ig = GateSyntaxIntegrador.from_object(my_obj)
    ig.run()

Usage (fluent):
    GateSyntaxIntegrador.create() \\
        .bind("volume", getter=lambda: vol, setter=lambda v: set_vol(v),
              min=0, max=100) \\
        .action("Mute", mute_fn) \\
        .run()
"""
from __future__ import annotations

import inspect
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Type

# ── Binding descriptor ─────────────────────────────────────────────────────────

@dataclass
class _Binding:
    name:   str
    label:  str
    getter: Optional[Callable[[], Any]]   = None
    setter: Optional[Callable[[Any], None]] = None
    action: Optional[Callable[[], None]]  = None
    min:    float = 0.0
    max:    float = 100.0
    type_hint: Optional[Type] = None

    @property
    def is_action(self) -> bool:
        return self.action is not None

    @property
    def resolved_type(self) -> Optional[Type]:
        if self.type_hint:
            return self.type_hint
        if self.getter:
            try:
                val = self.getter()
                if val is not None:
                    return type(val)
            except Exception:
                pass
        return str


# ── Integrador ─────────────────────────────────────────────────────────────────

class GateSyntaxIntegrador:
    """
    Live-binding bridge between any Python program and a GateSyntax UI.
    """

    def __init__(self, poll_hz: float = 30, title: str = "GateSyntax Integrador") -> None:
        self._bindings: list[_Binding] = []
        self._poll_hz   = poll_hz
        self._title     = title
        self._store     = None      # set when run() is called
        self._running   = False

    # ── Decorator-style registration ──────────────────────────────────────────

    def expose(self, *, label: str = "", min: float = 0.0,
               max: float = 100.0, type_hint: Optional[Type] = None):
        """Decorate a zero-argument getter function to expose it as a bindable value."""
        def decorator(fn: Callable[[], Any]) -> Callable[[], Any]:
            name = fn.__name__
            rtype = type_hint or (
                fn.__annotations__.get("return") if fn.__annotations__ else None)
            self._bindings.append(_Binding(
                name=name, label=label or name,
                getter=fn, min=min, max=max, type_hint=rtype))
            return fn
        return decorator

    def expose_setter(self, binding_name: str):
        """Decorate a setter function and attach it to an existing binding."""
        def decorator(fn: Callable[[Any], None]) -> Callable[[Any], None]:
            for b in self._bindings:
                if b.name == binding_name:
                    b.setter = fn
                    break
            return fn
        return decorator

    def action(self, *, label: str = ""):
        """Decorate a zero-argument function to expose it as an action button."""
        def decorator(fn: Callable[[], None]) -> Callable[[], None]:
            name = fn.__name__
            self._bindings.append(_Binding(
                name=name, label=label or name, action=fn))
            return fn
        return decorator

    # ── Fluent registration ───────────────────────────────────────────────────

    def bind(self, name: str, *,
             getter: Callable[[], Any],
             setter: Optional[Callable[[Any], None]] = None,
             min: float = 0.0, max: float = 100.0,
             label: str = "",
             type_hint: Optional[Type] = None) -> "GateSyntaxIntegrador":
        self._bindings.append(_Binding(
            name=name, label=label or name,
            getter=getter, setter=setter,
            min=min, max=max, type_hint=type_hint))
        return self

    def add_action(self, name: str, fn: Callable[[], None],
                   label: str = "") -> "GateSyntaxIntegrador":
        self._bindings.append(_Binding(
            name=name, label=label or name, action=fn))
        return self

    # ── Object reflection ─────────────────────────────────────────────────────

    @classmethod
    def from_object(cls, obj: Any,
                    poll_hz: float = 30,
                    title: str = "GateSyntax Integrador") -> "GateSyntaxIntegrador":
        """Auto-discover public attributes and methods from an object."""
        ig = cls(poll_hz=poll_hz, title=title)
        for name, member in inspect.getmembers(obj):
            if name.startswith("_"):
                continue
            if callable(member) and not isinstance(member, type):
                sig = inspect.signature(member)
                if not any(p.default is inspect.Parameter.empty
                           for p in sig.parameters.values()):
                    ig.add_action(name, member)
            else:
                current = getattr(obj, name, None)
                if not callable(current):
                    ig.bind(
                        name,
                        getter=lambda n=name: getattr(obj, n),
                        setter=lambda v, n=name: setattr(obj, n, v),
                        type_hint=type(current) if current is not None else str,
                    )
        return ig

    # ── .ui generation ────────────────────────────────────────────────────────

    def _generate_ui(self) -> str:
        lines: list[str] = [
            f'WINDOW Root :: TITLE "{self._title}"',
            "SCROLL MainScroll :: IN [Root]",
            "COL    MainCol    :: IN [MainScroll]",
        ]

        for b in self._bindings:
            var_ = f"GS_{b.name.upper()}"

            if b.is_action:
                lines.append(
                    f'BUTTON {b.name}Btn :: IN [MainCol]'
                    f' :: LABEL "▶  {b.label}"'
                    f' :: ON CLICK /{var_}_CALL :: "CALL_{b.name.upper()}"\\')

            elif b.resolved_type in (int, float):
                init = b.getter() if b.getter else b.min
                try:
                    init = float(init)
                except Exception:
                    init = b.min
                lines += [
                    f"/{var_} :: {init}\\",
                    f'LABEL  {b.name}Lbl :: IN [MainCol] :: TEXT "{b.label}:  " + [{var_}]',
                    f"SLIDER {b.name}Sl  :: IN [MainCol]"
                    f" :: MIN {b.min} :: MAX {b.max}"
                    f" :: VALUE [{var_}]"
                    f" :: ON CHANGE /{var_} :: [{b.name}Sl]\\",
                    f"RULE   {b.name}Sep :: IN [MainCol]",
                ]

            elif b.resolved_type == bool:
                init = bool(b.getter()) if b.getter else False
                lines += [
                    f"/{var_} :: {'TRUE' if init else 'FALSE'}\\",
                    f'TOGGLE {b.name}Tog :: IN [MainCol]'
                    f' :: LABEL "{b.label}"'
                    f' :: VALUE [{var_}]'
                    f' :: ON CHANGE /{var_} :: [{b.name}Tog]\\',
                ]

            else:
                init = str(b.getter()) if b.getter else ""
                lines += [
                    f'/{var_} :: "{init}"\\',
                    f'LABEL {b.name}Lbl :: IN [MainCol] :: TEXT "{b.label}"',
                    f'INPUT {b.name}In  :: IN [MainCol]'
                    f' :: HINT "Enter {b.label}…"'
                    f' :: ON CHANGE /{var_} :: [{b.name}In]\\',
                ]

        return "\n".join(lines)

    # ── Live poll loop ────────────────────────────────────────────────────────

    def _live_loop(self) -> None:
        interval = 1.0 / max(self._poll_hz, 1.0)
        while self._running:
            for b in self._bindings:
                if b.getter is None:
                    continue
                try:
                    current = b.getter()
                    if self._store:
                        self._store.set(f"GS_{b.name.upper()}", current)
                except Exception:
                    pass
            time.sleep(interval)

    # ── Entry point ───────────────────────────────────────────────────────────

    def run(self, backend: str = "auto") -> None:
        """
        Build and launch the GateSyntax UI.

        backend: "textual" | "qt" | "auto"
          auto = tries PyQt first, falls back to Textual.
        """
        # Import the appropriate builder
        try:
            if backend in ("qt", "auto"):
                import sys, os
                sys.path.insert(0, str(_find_root("GateSyntaxPy-Qt")))
                from gatesyntax_builder import GateSyntaxBuilder  # type: ignore
        except ImportError:
            import sys
            sys.path.insert(0, str(_find_root("GateSyntaxPy")))
            from gatesyntax_builder import GateSyntaxBuilder  # type: ignore

        ui_content = self._generate_ui()
        app, store = (
            GateSyntaxBuilder()
            .add_content(ui_content)
            .with_persistence(False)
            .build_with_state()
        )

        self._store = store

        # UI → host: state changes call setter
        for b in self._bindings:
            if b.setter is None:
                continue
            var_name = f"GS_{b.name.upper()}"
            setter = b.setter
            def _make_cb(s):
                def cb(v):
                    try:
                        s(v)
                    except Exception:
                        pass
                return cb
            store.subscribe(var_name, _make_cb(setter))

        # Actions: map CALL_XXX → the Python function
        for b in self._bindings:
            if not b.is_action:
                continue
            action_key = f"CALL_{b.name.upper()}"
            fn = b.action
            # GateSyntaxPy/Qt registers actions on the runtime, not the builder
            # We use store.subscribe on the _CALL var as a trigger
            call_var = f"GS_{b.name.upper()}_CALL"
            def _action_cb(v, f=fn):
                try:
                    f()
                except Exception:
                    pass
            store.subscribe(call_var, _action_cb)

        # Start live poll thread
        self._running = True
        poll_thread = threading.Thread(target=self._live_loop, daemon=True)
        poll_thread.start()

        try:
            app.run()
        finally:
            self._running = False

    # ── Static factories ──────────────────────────────────────────────────────

    @staticmethod
    def create(poll_hz: float = 30) -> "GateSyntaxIntegrador":
        return GateSyntaxIntegrador(poll_hz=poll_hz)

    @staticmethod
    def run_for(obj: Any, **kwargs) -> None:
        GateSyntaxIntegrador.from_object(obj, **kwargs).run()


# ── Path helper ───────────────────────────────────────────────────────────────

def _find_root(sibling_name: str):
    """Walk up from this file to locate a sibling GateSyntax folder."""
    from pathlib import Path
    here = Path(__file__).resolve().parent
    for folder in [here, here.parent, here.parent.parent]:
        candidate = folder / sibling_name
        if candidate.exists():
            return candidate
    return here  # fallback: same directory
