"""UI runtime — PyQt5/PyQt6 GUI implementation of GateSyntax.

Drop-in replacement for the Textual-based ui_runtime.py.
Requires: pip install PyQt5   (or pip install PyQt6)
"""
from __future__ import annotations
import sys
from pathlib import Path
from typing import Any, Callable

# ── PyQt5 / PyQt6 compatibility ───────────────────────────────────────────────
try:
    from PyQt6.QtWidgets import (
        QApplication, QMainWindow, QWidget, QLabel, QPushButton,
        QLineEdit, QCheckBox, QSlider, QProgressBar, QTabWidget,
        QScrollArea, QFrame, QListWidget, QListWidgetItem,
        QTextEdit, QVBoxLayout, QHBoxLayout, QGridLayout, QGroupBox,
        QSizePolicy, QLayout, QSpacerItem, QMessageBox,
    )
    from PyQt6.QtCore import Qt, QObject, pyqtSignal, QThread
    from PyQt6.QtGui import QPainter, QColor, QFont, QPen

    _H          = Qt.Orientation.Horizontal
    _ALIGN_L    = Qt.AlignmentFlag.AlignLeft
    _ALIGN_C    = Qt.AlignmentFlag.AlignCenter
    _ALIGN_V    = Qt.AlignmentFlag.AlignVCenter
    _ALIGN_H    = Qt.AlignmentFlag.AlignHCenter
    _NO_PEN     = Qt.PenStyle.NoPen
    _ANTIALIAS  = QPainter.RenderHint.Antialiasing
    _HLINE      = QFrame.Shape.HLine
    _SUNKEN     = QFrame.Shadow.Sunken
    _EXP        = QSizePolicy.Policy.Expanding
    _PREF       = QSizePolicy.Policy.Preferred
    _MIN        = QSizePolicy.Policy.Minimum
    _FIX        = QSizePolicy.Policy.Fixed
    _SET_MIN    = QLayout.SizeConstraint.SetMinimumSize
    _QUEUED     = Qt.ConnectionType.QueuedConnection
    _USER_ROLE  = Qt.ItemDataRole.UserRole
    _W_BOLD     = QFont.Weight.Bold
    _W_NORMAL   = QFont.Weight.Normal
    _HLINE_VAL  = QFrame.Shape.HLine.value  # for QSS selector

    def _exec(app: QApplication) -> int: return app.exec()

except ImportError:
    from PyQt5.QtWidgets import (
        QApplication, QMainWindow, QWidget, QLabel, QPushButton,
        QLineEdit, QCheckBox, QSlider, QProgressBar, QTabWidget,
        QScrollArea, QFrame, QListWidget, QListWidgetItem,
        QTextEdit, QVBoxLayout, QHBoxLayout, QGridLayout, QGroupBox,
        QSizePolicy, QLayout, QSpacerItem, QMessageBox,
    )
    from PyQt5.QtCore import Qt, QObject, pyqtSignal, QThread
    from PyQt5.QtGui import QPainter, QColor, QFont, QPen

    _H          = Qt.Horizontal
    _ALIGN_L    = Qt.AlignLeft
    _ALIGN_C    = Qt.AlignCenter
    _ALIGN_V    = Qt.AlignVCenter
    _ALIGN_H    = Qt.AlignHCenter
    _NO_PEN     = Qt.NoPen
    _ANTIALIAS  = QPainter.Antialiasing
    _HLINE      = QFrame.HLine
    _SUNKEN     = QFrame.Sunken
    _EXP        = QSizePolicy.Expanding
    _PREF       = QSizePolicy.Preferred
    _MIN        = QSizePolicy.Minimum
    _FIX        = QSizePolicy.Fixed
    _SET_MIN    = QLayout.SetMinimumSize
    _QUEUED     = Qt.QueuedConnection
    _USER_ROLE  = Qt.UserRole
    _W_BOLD     = QFont.Bold
    _W_NORMAL   = QFont.Normal
    _HLINE_VAL  = 4  # QFrame.HLine == 4 in Qt5

    def _exec(app: QApplication) -> int: return app.exec_()


from .syntax_node import ElementDecl, StateDecl, SyntaxNode, Behavior, RefExpr
from .syntax_parser import SyntaxParser
from .state_store import StateStore
from .expression_evaluator import ExpressionEvaluator
from .live_binding import collect_refs


# ── Rich-to-Qt colour map ─────────────────────────────────────────────────────

_RICH_COLORS: dict[str, str] = {
    "bright_blue":    "#4499FF",
    "bright_red":     "#FF5555",
    "bright_yellow":  "#FFD740",
    "bright_green":   "#55EE55",
    "bright_cyan":    "#55EEEE",
    "bright_magenta": "#EE55EE",
    "bright_white":   "#FFFFFF",
    "blue":           "#3366CC",
    "red":            "#CC3333",
    "yellow":         "#CCAA00",
    "green":          "#33AA33",
    "cyan":           "#33AAAA",
    "magenta":        "#AA33AA",
    "white":          "#CCCCCC",
    "dim":            "#777777",
}

# Inline style snippets applied by STYLE "class" prop
_STYLE_MAP: dict[str, str] = {
    "h1":    "font-size: 17px; font-weight: bold; color: #6688cc;"
             " padding-top: 6px; padding-bottom: 4px;",
    "h2":    "font-size: 13px; font-weight: bold; color: #88aadd; margin-top: 6px;",
    "muted": "color: #888888; margin-bottom: 4px;",
}


def _qcolor(c: str) -> str:
    """Resolve a Rich/Textual colour name to a Qt-compatible hex string."""
    return _RICH_COLORS.get(c.lower().strip(), c)


# ── Thread-safe relay ─────────────────────────────────────────────────────────

class _Relay(QObject):
    """Marshals arbitrary callables from any thread to the Qt main thread."""
    _sig = pyqtSignal(object)

    def __init__(self) -> None:
        super().__init__()
        # _QUEUED ensures the slot runs in the thread that owns this QObject
        # (the main thread, since _Relay is always created there).
        self._sig.connect(self._dispatch, _QUEUED)

    def _dispatch(self, fn: Callable) -> None:
        fn()

    def call(self, fn: Callable) -> None:
        """Schedule fn to run on the main thread (safe to call from any thread)."""
        self._sig.emit(fn)


# ── Async background worker ───────────────────────────────────────────────────

class _AsyncWorker(QThread):
    _prog = pyqtSignal(int)
    _stat = pyqtSignal(str)

    def __init__(self, store: StateStore, relay: _Relay) -> None:
        super().__init__()
        self._store = store
        # Signals are emitted from the worker thread; relay.call() marshals
        # the store.set() call back to the main thread so Qt widgets are
        # always updated from the correct thread.
        self._prog.connect(lambda v: relay.call(lambda: store.set("ASYNC_PROGRESS", v)))
        self._stat.connect(lambda s: relay.call(lambda: store.set("ASYNC_STATUS",   s)))

    def run(self) -> None:
        self._stat.emit("Running")
        for i in range(0, 101, 5):
            self._prog.emit(i)
            self.msleep(100)
        self._stat.emit("Done")
        self._prog.emit(100)


# ── Custom Gauge widget ───────────────────────────────────────────────────────

class GaugeWidget(QWidget):
    """Rectangular filled-bar gauge drawn with QPainter."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._value: float = 0.0
        self._max:   float = 100.0
        self._label: str   = ""
        self._color: str   = "#4499FF"
        self.setMinimumSize(180, 60)
        self.setSizePolicy(_EXP, _FIX)

    def set_value(self, v: float) -> None:
        self._value = float(v)
        self.update()

    def set_max(self, mx: float) -> None:
        self._max = float(mx)
        self.update()

    def set_label(self, lbl: str) -> None:
        self._label = lbl
        self.update()

    def set_color(self, color: str) -> None:
        self._color = _qcolor(color)
        self.update()

    def paintEvent(self, _event: Any) -> None:  # noqa: N802
        p = QPainter(self)
        p.setRenderHint(_ANTIALIAS)
        w, h = self.width(), self.height()
        mx = 8

        if self._label:
            f = QFont("Segoe UI", 9)
            f.setWeight(_W_BOLD)
            p.setFont(f)
            p.setPen(QColor("#cccccc"))
            p.drawText(mx, 0, w - mx * 2, 20, _ALIGN_L | _ALIGN_V, self._label)

        bar_y = 22 if self._label else 8
        bar_h = max(6, h - bar_y - 22)
        bar_w = w - mx * 2
        pct   = min(1.0, max(0.0, self._value / max(self._max, 1.0)))
        fill  = max(0, int(bar_w * pct))

        p.setPen(_NO_PEN)
        p.setBrush(QColor("#2a2a3e"))
        p.drawRoundedRect(mx, bar_y, bar_w, bar_h, 4.0, 4.0)
        if fill:
            p.setBrush(QColor(self._color))
            p.drawRoundedRect(mx, bar_y, fill, bar_h, 4.0, 4.0)

        p.setPen(QColor("#cccccc"))
        p.setFont(QFont("Segoe UI", 8))
        p.drawText(mx, bar_y + bar_h + 2, bar_w, 18, _ALIGN_H | _ALIGN_V,
                   f"{self._value:.0f} / {self._max:.0f}")
        p.end()


# ── Helper: build a container QWidget with a given layout ────────────────────

def _vbox(*children: QWidget, spacing: int = 4, margins: tuple = (0, 0, 0, 0)) -> QWidget:
    w = QWidget()
    lay = QVBoxLayout(w)
    lay.setContentsMargins(*margins)
    lay.setSpacing(spacing)
    lay.setSizeConstraint(_SET_MIN)
    for c in children:
        lay.addWidget(c)
    return w


def _hbox(*children: QWidget, spacing: int = 4, margins: tuple = (0, 0, 0, 0)) -> QWidget:
    w = QWidget()
    lay = QHBoxLayout(w)
    lay.setContentsMargins(*margins)
    lay.setSpacing(spacing)
    for c in children:
        lay.addWidget(c)
    lay.addStretch()
    return w


# ── Main runtime ─────────────────────────────────────────────────────────────

class UIRuntime:
    def __init__(self, nodes: list[SyntaxNode], store: StateStore) -> None:
        self._nodes     = nodes
        self._store     = store
        self._eval      = ExpressionEvaluator(store)
        self._node_map:      dict[str, ElementDecl]    = {}
        self._children_map:  dict[str, list[str]]      = {}
        self._widget_map:    dict[str, QWidget]        = {}
        self._behaviors_map: dict[str, list[Behavior]] = {}
        self._actions:       dict[str, Callable]       = {}
        self._window_id:     str  = ""
        self._window_title:  str  = "GateSyntaxPy"
        self._window:        "GateSyntaxWindow | None" = None
        self._relay:         _Relay = _Relay()
        self._ready:         bool = False
        self._updating:      set[str] = set()

    def register_action(self, name: str, action: Callable) -> None:
        self._actions[name.upper()] = action

    # ── Build tree ────────────────────────────────────────────────────────────

    def build_root_widget(self) -> QWidget:
        element_nodes = [n for n in self._nodes if isinstance(n, ElementDecl)]

        for node in element_nodes:
            self._node_map[node.id] = node
            self._behaviors_map[node.id] = node.behaviors

            if node.noun == "WINDOW":
                self._window_id = node.id
                for p in node.props:
                    if p.key == "TITLE" and not collect_refs(p.value):
                        self._window_title = ExpressionEvaluator.to_str(
                            self._eval.evaluate(p.value))
                continue

            parent_id = self._get_parent_id(node)
            if parent_id:
                self._children_map.setdefault(parent_id, []).append(node.id)

        root_children = self._children_map.get(self._window_id, [])
        widgets = [w for cid in root_children
                   if (w := self._build_subtree(cid)) is not None]

        if not widgets:
            return QWidget()
        if len(widgets) == 1:
            return widgets[0]
        return _vbox(*widgets)

    def _build_subtree(self, node_id: str) -> QWidget | None:
        node = self._node_map.get(node_id)
        if node is None:
            return None

        child_ids = self._children_map.get(node_id, [])

        # TABS and LIST are handled specially — they consume their children
        # directly instead of receiving pre-built child widgets.
        if node.noun == "TABS":
            return self._build_tabs(node, child_ids)
        if node.noun == "LIST":
            return self._build_list(node, child_ids)
        # TAB nodes are consumed by _build_tabs; skip if encountered standalone.
        if node.noun == "TAB":
            return None

        child_widgets = [w for cid in child_ids
                         if (w := self._build_subtree(cid)) is not None]

        widget = self._create_widget(node, child_widgets)
        if widget is None:
            return None
        self._widget_map[node_id] = widget
        self._apply_static_props(widget, node)
        return widget

    # ── TABS builder ─────────────────────────────────────────────────────────

    def _build_tabs(self, node: ElementDecl, child_ids: list[str]) -> QTabWidget:
        tabs = QTabWidget()
        tabs.setObjectName(node.id)
        self._widget_map[node.id] = tabs

        for cid in child_ids:
            tab_node = self._node_map.get(cid)
            if tab_node is None or tab_node.noun != "TAB":
                continue
            label = self._static_prop_str(tab_node, "LABEL") or cid

            tab_child_ids = self._children_map.get(cid, [])
            tab_children  = [w for tcid in tab_child_ids
                             if (w := self._build_subtree(tcid)) is not None]

            content = QWidget()
            lay = QVBoxLayout(content)
            lay.setContentsMargins(0, 0, 0, 0)
            lay.setSpacing(0)
            lay.setSizeConstraint(_SET_MIN)
            for cw in tab_children:
                lay.addWidget(cw)

            self._widget_map[cid] = content
            tabs.addTab(content, label)

        self._apply_static_props(tabs, node)
        return tabs

    # ── LIST builder ─────────────────────────────────────────────────────────

    def _build_list(self, node: ElementDecl, child_ids: list[str]) -> QListWidget:
        nid = node.id
        lw  = QListWidget()
        lw.setObjectName(nid)

        for cid in child_ids:
            item_node = self._node_map.get(cid)
            if item_node is None:
                continue
            item_label = self._static_prop_str(item_node, "LABEL") or cid
            qi = QListWidgetItem(item_label)
            qi.setData(_USER_ROLE, cid)
            lw.addItem(qi)

        lw.currentItemChanged.connect(
            lambda cur, _prev, w=lw, wid=nid: self._on_list_change(wid, cur))

        self._widget_map[nid] = lw
        self._apply_static_props(lw, node)
        return lw

    def _on_list_change(self, wid: str, item: QListWidgetItem | None) -> None:
        if item is None or wid in self._updating:
            return
        item_id = item.data(_USER_ROLE) or ""
        self.handle_event(wid, "CHANGE", item_id)

    # ── Widget factory ────────────────────────────────────────────────────────

    def _create_widget(self, node: ElementDecl,
                       children: list[QWidget]) -> QWidget | None:
        noun  = node.noun
        nid   = node.id
        label = (self._static_prop_str(node, "LABEL") or
                 self._static_prop_str(node, "TEXT") or "")

        match noun:
            # ── Containers ────────────────────────────────────────────────
            case "COL" | "STACK":
                return _vbox(*children, spacing=4)
            case "ROW":
                return _hbox(*children, spacing=6)
            case "GRID" | "UNIFORMGRID":
                cols = int(self._static_prop_num(node, "COLS") or 3)
                w    = QWidget()
                lay  = QGridLayout(w)
                lay.setContentsMargins(0, 0, 0, 0)
                lay.setSpacing(6)
                for i, c in enumerate(children):
                    r, col = divmod(i, cols)
                    lay.addWidget(c, r, col)
                return w
            case "PANEL":
                title = self._static_prop_str(node, "LABEL") or ""
                gb    = QGroupBox(title)
                lay   = QVBoxLayout(gb)
                lay.setContentsMargins(8, 8, 8, 8)
                lay.setSpacing(4)
                for c in children:
                    lay.addWidget(c)
                return gb
            case "SCROLL":
                scroll = QScrollArea()
                scroll.setObjectName(nid)
                scroll.setWidgetResizable(True)
                scroll.setHorizontalScrollBarPolicy(
                    Qt.ScrollBarPolicy.ScrollBarAlwaysOff
                    if hasattr(Qt, "ScrollBarPolicy")
                    else Qt.ScrollBarAlwaysOff)
                if children:
                    inner = children[0] if len(children) == 1 else _vbox(*children)
                else:
                    inner = QWidget()
                scroll.setWidget(inner)
                return scroll
            # ── Leaf widgets ──────────────────────────────────────────────
            case "LABEL":
                lbl = QLabel(label or " ")
                lbl.setObjectName(nid)
                lbl.setWordWrap(True)
                return lbl
            case "BUTTON":
                btn = QPushButton(label or "Button")
                btn.setObjectName(nid)
                btn.clicked.connect(
                    lambda _checked=False, wid=nid: self.handle_event(wid, "CLICK"))
                return btn
            case "INPUT":
                hint = self._static_prop_str(node, "HINT") or ""
                inp  = QLineEdit()
                inp.setObjectName(nid)
                inp.setPlaceholderText(hint)
                inp.textChanged.connect(
                    lambda txt, wid=nid: self.handle_event(wid, "CHANGE", txt))
                return inp
            case "CHECK":
                chk = QCheckBox(label)
                chk.setObjectName(nid)
                chk.stateChanged.connect(
                    lambda _s, w=chk, wid=nid: self.handle_event(wid, "CHANGE", w.isChecked()))
                return chk
            case "TOGGLE":
                tog = QCheckBox(label or "")
                tog.setObjectName(nid)
                tog.setProperty("gstype", "toggle")
                tog.stateChanged.connect(
                    lambda _s, w=tog, wid=nid: self.handle_event(wid, "CHANGE", w.isChecked()))
                return tog
            case "PROGRESS":
                total = int(self._static_prop_num(node, "MAX") or 100)
                pb    = QProgressBar()
                pb.setObjectName(nid)
                pb.setMinimum(0)
                pb.setMaximum(total)
                pb.setValue(0)
                return pb
            case "SLIDER":
                mn  = int(self._static_prop_num(node, "MIN") or 0)
                mx  = int(self._static_prop_num(node, "MAX") or 100)
                val = int(self._static_prop_num(node, "VALUE") or mn)
                sl  = QSlider(_H)
                sl.setObjectName(nid)
                sl.setMinimum(mn)
                sl.setMaximum(mx)
                sl.setValue(val)
                sl.valueChanged.connect(
                    lambda v, wid=nid: self.handle_event(wid, "CHANGE", float(v)))
                return sl
            case "SEPARATOR" | "RULE":
                line = QFrame()
                line.setObjectName(nid)
                line.setFrameShape(_HLINE)
                line.setFrameShadow(_SUNKEN)
                return line
            case "GAUGE":
                g  = GaugeWidget()
                g.setObjectName(nid)
                mx = self._static_prop_num(node, "MAX")
                if mx is not None:
                    g.set_max(float(mx))
                lbl2 = (self._static_prop_str(node, "GAUGELABEL") or
                        self._static_prop_str(node, "LABEL") or "")
                g.set_label(lbl2)
                col = (self._static_prop_str(node, "STROKE") or
                       self._static_prop_str(node, "COLOR") or "#4499FF")
                g.set_color(col)
                return g
            case "TEXTAREA":
                ta = QTextEdit()
                ta.setObjectName(nid)
                return ta
            case _:
                lbl = QLabel(label or "")
                lbl.setObjectName(nid)
                return lbl

    # ── Static property helpers ───────────────────────────────────────────────

    def _static_prop_str(self, node: ElementDecl, key: str) -> str | None:
        for p in node.props:
            if p.key == key and not collect_refs(p.value):
                return ExpressionEvaluator.to_str(self._eval.evaluate(p.value))
        return None

    def _static_prop_num(self, node: ElementDecl, key: str) -> float | None:
        for p in node.props:
            if p.key == key and not collect_refs(p.value):
                try:
                    return ExpressionEvaluator.to_double(self._eval.evaluate(p.value))
                except Exception:
                    pass
        return None

    def _get_parent_id(self, node: ElementDecl) -> str | None:
        for p in node.props:
            if p.key == "IN" and isinstance(p.value, RefExpr):
                return p.value.var_name
        return None

    # ── Apply static props after widget creation ──────────────────────────────

    def _apply_static_props(self, widget: QWidget, node: ElementDecl) -> None:
        for p in node.props:
            if p.key in ("IN", "LABEL", "TEXT", "HINT", "MIN", "MAX",
                         "GAUGELABEL", "STROKE", "COLS", "ROWS"):
                continue
            if collect_refs(p.value):
                continue
            val = self._eval.evaluate(p.value)
            self._apply_prop(widget, node.id, p.key, val)

    def _apply_prop(self, widget: QWidget, nid: str, key: str, val: Any) -> None:
        match key:
            case "VALUE":
                self._set_value_safely(nid, widget, val)
            case "ENABLED":
                widget.setEnabled(ExpressionEvaluator.to_bool(val))
            case "VISIBLE":
                widget.setVisible(ExpressionEvaluator.to_bool(val))
            case "HEIGHT":
                h = int(ExpressionEvaluator.to_double(val))
                if isinstance(widget, QListWidget):
                    widget.setFixedHeight(h * 22)
                else:
                    widget.setFixedHeight(h)
            case "WIDTH":
                widget.setFixedWidth(int(ExpressionEvaluator.to_double(val)))
            case "MARGIN":
                t, r, b, l = self._parse_spacing(str(val))
                widget.setContentsMargins(l, t, r, b)
            case "PADDING":
                t, r, b, l = self._parse_spacing(str(val))
                if widget.layout():
                    widget.layout().setContentsMargins(l, t, r, b)
            case "STYLE":
                styles = " ".join(
                    _STYLE_MAP[cls] for cls in str(val).split() if cls in _STYLE_MAP)
                if styles:
                    widget.setStyleSheet(widget.styleSheet() + " " + styles)
            case "BG":
                widget.setStyleSheet(
                    widget.styleSheet() + f" background-color: {_qcolor(str(val))};")
            case "COLOR" | "FG":
                widget.setStyleSheet(
                    widget.styleSheet() + f" color: {_qcolor(str(val))};")
            case "TEXT":
                if isinstance(widget, QLabel):
                    widget.setText(str(val))
            case "READONLY":
                if isinstance(widget, QLineEdit):
                    widget.setReadOnly(ExpressionEvaluator.to_bool(val))
            case "INDETERMINATE":
                if isinstance(widget, QProgressBar) and ExpressionEvaluator.to_bool(val):
                    widget.setMinimum(0)
                    widget.setMaximum(0)

    def _set_value(self, widget: QWidget, val: Any) -> None:
        if isinstance(widget, QProgressBar):
            widget.setValue(int(ExpressionEvaluator.to_double(val)))
        elif isinstance(widget, QSlider):
            widget.setValue(int(ExpressionEvaluator.to_double(val)))
        elif isinstance(widget, QCheckBox):
            widget.setChecked(ExpressionEvaluator.to_bool(val))
        elif isinstance(widget, QLineEdit):
            widget.setText(ExpressionEvaluator.to_str(val))
        elif isinstance(widget, GaugeWidget):
            widget.set_value(ExpressionEvaluator.to_double(val))
        elif isinstance(widget, QTextEdit):
            widget.setPlainText(ExpressionEvaluator.to_str(val))

    def _set_value_safely(self, nid: str, widget: QWidget, val: Any) -> None:
        """Set widget value while suppressing re-entrant change events."""
        self._updating.add(nid)
        try:
            self._set_value(widget, val)
        finally:
            self._updating.discard(nid)

    @staticmethod
    def _parse_spacing(s: str) -> tuple[int, int, int, int]:
        parts = [p.strip() for p in s.replace(",", " ").split()]
        if len(parts) == 1:
            n = int(parts[0])
            return (n, n, n, n)
        if len(parts) == 2:
            return (int(parts[0]), int(parts[1]), int(parts[0]), int(parts[1]))
        if len(parts) == 4:
            return (int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3]))
        return (0, 0, 0, 0)

    # ── Live bindings (wired after window is shown) ───────────────────────────

    def wire_bindings(self, window: "GateSyntaxWindow") -> None:
        self._window = window
        self._register_builtin_actions()

        for node_id, node in self._node_map.items():
            for p in node.props:
                refs = collect_refs(p.value)
                if not refs:
                    continue
                self._bind_prop(node_id, p.key, p.value, refs)

        for node_id, behaviors in self._behaviors_map.items():
            for b in behaviors:
                if b.event == "LOAD":
                    self._handle_behavior(b, None)

        self._ready = True

    def _bind_prop(self, node_id: str, key: str,
                   expr: Any, refs: list[str]) -> None:
        def update() -> None:
            val = self._eval.evaluate(expr)
            # WINDOW title binding
            if node_id == self._window_id:
                if key == "TITLE" and self._window:
                    self._window.setWindowTitle(ExpressionEvaluator.to_str(val))
                return
            widget = self._widget_map.get(node_id)
            if widget is None:
                return
            self._apply_live_prop(widget, node_id, key, val)

        def callback(_: Any) -> None:
            # The relay marshals the update to the main thread, guarding
            # against cross-thread widget access from the async worker.
            self._relay.call(update)

        for ref in refs:
            self._store.subscribe(ref, callback)
        update()  # fire immediately on main thread

    def _apply_live_prop(self, widget: QWidget, nid: str,
                         key: str, val: Any) -> None:
        match key:
            case "TEXT" | "LABEL":
                if isinstance(widget, QLabel):
                    widget.setText(str(val))
                elif isinstance(widget, QPushButton):
                    widget.setText(str(val))
            case "VALUE":
                self._set_value_safely(nid, widget, val)
            case "ENABLED":
                widget.setEnabled(ExpressionEvaluator.to_bool(val))
            case "VISIBLE":
                widget.setVisible(ExpressionEvaluator.to_bool(val))
            case "TITLE":
                if self._window:
                    self._window.setWindowTitle(str(val))

    # ── Event dispatch ────────────────────────────────────────────────────────

    def handle_event(self, widget_id: str, event: str,
                     element_value: Any = None) -> None:
        if not self._ready or widget_id in self._updating:
            return
        for b in self._behaviors_map.get(widget_id, []):
            if b.event == event:
                self._handle_behavior(b, element_value)

    def _handle_behavior(self, b: Behavior, element_value: Any) -> None:
        if b.target_var == "__noop__":
            return

        if b.expression:
            refs = collect_refs(SyntaxParser.parse_value_expr(b.expression))
            if refs and element_value is not None and all(
                    r in self._widget_map for r in refs):
                val = element_value
            else:
                val = self._eval.evaluate_string(b.expression)
        else:
            val = element_value if element_value is not None else ""

        val_str = ExpressionEvaluator.to_str(val)
        if val_str.upper() in self._actions:
            self._actions[val_str.upper()]()
            return
        self._store.set(b.target_var, val)

    # ── Built-in actions ─────────────────────────────────────────────────────

    def _register_builtin_actions(self) -> None:
        win = self._window

        def _notify(msg: str, title: str) -> None:
            if win:
                win.show_notification(msg, title)

        def msg_info() -> None:
            msg = ExpressionEvaluator.to_str(self._store.get("DIALOG_MSG") or "Info")
            _notify(msg, "Info")
            self._store.set("DIALOG_MSG_RESULT", "OK")

        def msg_warn() -> None:
            msg = ExpressionEvaluator.to_str(self._store.get("DIALOG_MSG") or "Warning")
            _notify(msg, "Warning")
            self._store.set("DIALOG_MSG_RESULT", "OK")

        def msg_error() -> None:
            msg = ExpressionEvaluator.to_str(self._store.get("DIALOG_MSG") or "Error")
            _notify(msg, "Error")
            self._store.set("DIALOG_MSG_RESULT", "OK")

        def msg_confirm() -> None:
            msg = ExpressionEvaluator.to_str(self._store.get("DIALOG_MSG") or "Confirm?")
            _notify(f"[Confirm] {msg}", "Confirm")
            self._store.set("DIALOG_MSG_RESULT", "True")

        def async_start() -> None:
            worker = _AsyncWorker(self._store, self._relay)
            worker.finished.connect(worker.deleteLater)
            worker.start()

        def clip_copy() -> None:
            text = ExpressionEvaluator.to_str(self._store.get("CLIP_TEXT") or "")
            cb = QApplication.clipboard()
            if cb:
                cb.setText(text)
            _notify("Copied to clipboard", "Clipboard")

        self._actions.update({
            "MSG_INFO":    msg_info,
            "MSG_WARN":    msg_warn,
            "MSG_ERROR":   msg_error,
            "MSG_CONFIRM": msg_confirm,
            "ASYNC_START": async_start,
            "CLIP_COPY":   clip_copy,
        })


# ── Qt Window ─────────────────────────────────────────────────────────────────

class GateSyntaxWindow(QMainWindow):
    """QMainWindow driven by GateSyntax .ui files."""

    def __init__(self, runtime: UIRuntime) -> None:
        super().__init__()
        self._runtime = runtime
        self.setWindowTitle(runtime._window_title)
        self.resize(900, 640)

        root = runtime.build_root_widget()
        self.setCentralWidget(root)
        runtime.wire_bindings(self)

    def show_notification(self, msg: str, title: str) -> None:
        QMessageBox.information(self, title, msg)


# ── Application wrapper ───────────────────────────────────────────────────────

class GateSyntaxApp:
    """PyQt application wrapper — same public interface as the Textual version."""

    CSS_PATH: str | None = None

    def __init__(self, runtime: UIRuntime,
                 css_path: str | None = None) -> None:
        self._runtime  = runtime
        self._css_path = css_path or self.CSS_PATH

    def run(self, **_kwargs: Any) -> int:
        qapp = QApplication.instance() or QApplication(sys.argv)

        # High-DPI (Qt5 only; Qt6 enables this by default)
        if hasattr(Qt, "AA_EnableHighDpiScaling"):
            qapp.setAttribute(Qt.AA_EnableHighDpiScaling, True)

        if self._css_path:
            try:
                qapp.setStyleSheet(Path(self._css_path).read_text(encoding="utf-8"))
            except Exception:
                pass

        window = GateSyntaxWindow(self._runtime)
        window.show()
        return _exec(qapp)
