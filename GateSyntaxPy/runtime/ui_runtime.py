"""UI runtime — mirrors GateSyntax.Runtime.UIRuntime.cs, targeting Textual."""
from __future__ import annotations
import asyncio
from typing import Any, Callable

from textual.app import App, ComposeResult
from textual.widgets import (
    Button, Checkbox, DataTable, Input, Label, ListItem,
    ListView, ProgressBar, Rule, Select, Static, Switch,
    TabbedContent, TabPane, TextArea,
)
from textual.containers import (
    Container, Grid, Horizontal, ScrollableContainer, Vertical,
)
from textual.reactive import reactive
from textual.message import Message
from rich.text import Text

from .syntax_node import (
    ElementDecl, StateDecl, SyntaxNode, Behavior,
    RefExpr, LiteralExpr,
)
from .syntax_parser import SyntaxParser
from .state_store import StateStore
from .expression_evaluator import ExpressionEvaluator
from .live_binding import collect_refs


# ── Custom Gauge widget ───────────────────────────────────────────────────────

class GaugeWidget(Static):
    """Ring-style gauge rendered with Rich block characters."""

    gauge_value: reactive[float] = reactive(0.0)
    gauge_max: float = 100.0
    gauge_label: str = ""
    gauge_color: str = "bright_blue"

    def watch_gauge_value(self, value: float) -> None:
        self._redraw()

    def _redraw(self) -> None:
        pct = min(1.0, max(0.0, self.gauge_value / max(self.gauge_max, 1)))
        width = 24
        filled = round(pct * width)
        t = Text()
        if self.gauge_label:
            t.append(f" {self.gauge_label}\n", style="bold")
        t.append(" ▐", style="dim")
        t.append("█" * filled, style=self.gauge_color)
        t.append("░" * (width - filled), style="dim")
        t.append("▌", style="dim")
        t.append(f"  {self.gauge_value:.0f} / {self.gauge_max:.0f}\n",
                 style="italic dim")
        try:
            self.update(t)
        except Exception:
            pass  # Not yet mounted; on_mount fires _redraw again

    def on_mount(self) -> None:
        self._redraw()


# ── Custom Slider widget (Textual ≥0.52 Slider not always present) ────────────

class GsSlider(Static, can_focus=True):
    """Keyboard-driven horizontal slider rendered with block characters."""

    class Changed(Message):
        def __init__(self, slider: "GsSlider", value: float) -> None:
            super().__init__()
            self.slider = slider
            self.value = value

    value: reactive[float] = reactive(0.0)
    min_val: float = 0.0
    max_val: float = 100.0
    step: float = 1.0

    def watch_value(self, val: float) -> None:
        # Only redraw — do NOT post_message here.
        # Changed is posted explicitly in on_key so the event fires only on
        # genuine user interaction, never on programmatic (state-driven) updates.
        self._redraw()

    def _redraw(self) -> None:
        span = max(self.max_val - self.min_val, 1)
        pct = (self.value - self.min_val) / span
        width = 32
        filled = round(pct * width)
        t = Text()
        t.append("◀ ", style="dim")
        t.append("━" * filled, style="bright_blue bold")
        t.append("─" * (width - filled), style="dim")
        t.append(" ▶", style="dim")
        t.append(f"  {self.value:.0f}", style="bold")
        try:
            self.update(t)
        except Exception:
            pass  # Not yet mounted; on_mount fires _redraw again

    def on_mount(self) -> None:
        self._redraw()

    def _user_change(self, new_val: float) -> None:
        """Called only on user-initiated changes; posts the Changed message."""
        self.value = new_val
        self.post_message(self.Changed(self, self.value))

    def on_key(self, event) -> None:
        if event.key == "right":
            self._user_change(min(self.max_val, self.value + self.step))
            event.stop()
        elif event.key == "left":
            self._user_change(max(self.min_val, self.value - self.step))
            event.stop()

    def on_click(self, event) -> None:
        # Click on left half decrements, right half increments
        self.focus()


# ── Main runtime ─────────────────────────────────────────────────────────────

class UIRuntime:
    def __init__(self, nodes: list[SyntaxNode], store: StateStore) -> None:
        self._nodes = nodes
        self._store = store
        self._eval = ExpressionEvaluator(store)
        self._node_map: dict[str, ElementDecl] = {}
        self._children_map: dict[str, list[str]] = {}   # parent_id -> [child_id, ...]
        self._widget_map: dict[str, Any] = {}           # id -> widget
        self._behaviors_map: dict[str, list[Behavior]] = {}
        self._actions: dict[str, Callable] = {}
        self._window_id: str = ""
        self._window_title: str = "GateSyntaxPy"
        self._app: "GateSyntaxApp | None" = None
        self._ready: bool = False   # True only after wire_bindings completes

    def register_action(self, name: str, action: Callable) -> None:
        self._actions[name.upper()] = action

    # ── Build tree ────────────────────────────────────────────────────────────

    def build_root_widget(self) -> Any:
        """Parse nodes into a Textual widget tree; return the root widget."""
        self._tab_children: dict[str, list[str]] = {}  # tabs_id -> [tab_id]
        element_nodes = [n for n in self._nodes if isinstance(n, ElementDecl)]

        for node in element_nodes:
            self._node_map[node.id] = node
            self._behaviors_map[node.id] = node.behaviors

            if node.noun == "WINDOW":
                self._window_id = node.id
                for p in node.props:
                    if p.key == "TITLE":
                        self._window_title = ExpressionEvaluator.to_str(
                            self._eval.evaluate(p.value))
                continue

            parent_id = self._get_parent_id(node)
            if parent_id:
                self._children_map.setdefault(parent_id, []).append(node.id)

        # Build recursively from window's children
        root_children = self._children_map.get(self._window_id, [])
        widgets = [self._build_subtree(cid) for cid in root_children]

        if len(widgets) == 1:
            return widgets[0]
        return Vertical(*widgets, id="__gs_root__")

    def _build_subtree(self, node_id: str) -> Any:
        node = self._node_map[node_id]
        child_ids = self._children_map.get(node_id, [])

        # TabbedContent in Textual v8 cannot receive TabPane as constructor args.
        # Build TabPane subtrees separately; add_pane() called in on_mount.
        if node.noun == "TABS":
            for cid in child_ids:
                self._build_subtree(cid)  # build TabPanes into _widget_map
            self._tab_children[node_id] = child_ids
            widget = TabbedContent(id=node_id)
            self._widget_map[node_id] = widget
            self._apply_static_props(widget, node)
            return widget

        child_widgets = [self._build_subtree(cid) for cid in child_ids]
        widget = self._create_widget(node, child_widgets)
        self._widget_map[node_id] = widget
        self._apply_static_props(widget, node)
        return widget

    # ── Widget factory ────────────────────────────────────────────────────────

    def _create_widget(self, node: ElementDecl, children: list) -> Any:
        noun = node.noun
        nid = node.id
        label = self._static_prop_str(node, "LABEL") or \
                self._static_prop_str(node, "TEXT") or ""

        match noun:
            case "COL" | "STACK":
                return Vertical(*children, id=nid)
            case "ROW":
                return Horizontal(*children, id=nid)
            case "GRID":
                return Grid(*children, id=nid)
            case "UNIFORMGRID":
                return Grid(*children, id=nid)
            case "PANEL":
                return Vertical(*children, id=nid, classes="gs-panel")
            case "SCROLL":
                return ScrollableContainer(*children, id=nid)
            case "TABS":
                return TabbedContent(*children, id=nid)
            case "TAB":
                tab_label = self._static_prop_str(node, "LABEL") or nid
                return TabPane(tab_label, *children, id=nid)
            case "LABEL":
                return Label(label or " ", id=nid)
            case "BUTTON":
                return Button(label or "Button", id=nid)
            case "INPUT":
                hint = self._static_prop_str(node, "HINT") or ""
                return Input(placeholder=hint, id=nid)
            case "CHECK":
                return Checkbox(label, id=nid)
            case "TOGGLE":
                return Switch(id=nid)
            case "PROGRESS":
                total = float(self._static_prop_num(node, "MAX") or 100)
                return ProgressBar(total=total, id=nid, show_eta=False)
            case "SLIDER":
                mn = float(self._static_prop_num(node, "MIN") or 0)
                mx = float(self._static_prop_num(node, "MAX") or 100)
                val = float(self._static_prop_num(node, "VALUE") or mn)
                gs = GsSlider(id=nid)
                gs.min_val = mn
                gs.max_val = mx
                gs.value = val
                return gs
            case "LIST":
                return ListView(*children, id=nid)
            case "ITEM":
                item_label = self._static_prop_str(node, "LABEL") or nid
                return ListItem(Label(item_label), id=nid)
            case "SEPARATOR" | "RULE":
                return Rule(id=nid)
            case "GAUGE":
                g = GaugeWidget(id=nid)
                mx2 = self._static_prop_num(node, "MAX")
                if mx2 is not None:
                    g.gauge_max = float(mx2)
                lbl = self._static_prop_str(node, "GAUGELABEL") or \
                      self._static_prop_str(node, "LABEL") or ""
                g.gauge_label = lbl
                col = self._static_prop_str(node, "STROKE") or \
                      self._static_prop_str(node, "COLOR") or "bright_blue"
                g.gauge_color = col
                return g
            case "TEXTAREA":
                return TextArea(id=nid)
            case _:
                return Static(label or "", id=nid)

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

    # ── Apply static props to already-created widget ─────────────────────────

    def _apply_static_props(self, widget: Any, node: ElementDecl) -> None:
        for p in node.props:
            if p.key in ("IN", "LABEL", "TEXT", "HINT", "MIN", "MAX",
                         "GAUGELABEL", "STROKE"):
                continue  # handled in factory or at wire time
            if collect_refs(p.value):
                continue  # live — handled in wire_bindings
            val = self._eval.evaluate(p.value)
            self._apply_prop(widget, node.id, p.key, val)

    def _apply_prop(self, widget: Any, nid: str, key: str, val: Any) -> None:
        match key:
            case "VALUE":
                self._set_value(widget, val)
            case "ENABLED":
                widget.disabled = not ExpressionEvaluator.to_bool(val)
            case "VISIBLE":
                widget.display = ExpressionEvaluator.to_bool(val)
            case "HEIGHT":
                widget.styles.height = int(ExpressionEvaluator.to_double(val))
            case "WIDTH":
                widget.styles.width = int(ExpressionEvaluator.to_double(val))
            case "MARGIN":
                widget.styles.margin = self._parse_spacing(str(val))
            case "PADDING":
                widget.styles.padding = self._parse_spacing(str(val))
            case "STYLE":
                for cls in str(val).split():
                    widget.add_class(cls)
            case "BG":
                widget.styles.background = str(val)
            case "COLOR" | "FG":
                widget.styles.color = str(val)
            case "COLS":
                n = int(ExpressionEvaluator.to_double(val))
                widget.styles.grid_size_columns = n
            case "ROWS":
                n = int(ExpressionEvaluator.to_double(val))
                widget.styles.grid_size_rows = n
            case "READONLY":
                if isinstance(widget, Input):
                    widget.disabled = ExpressionEvaluator.to_bool(val)
            case "MULTILINE":
                pass  # Use TEXTAREA noun instead
            case "TEXT":
                if isinstance(widget, (Label, Static)):
                    widget.update(str(val))
            case "INDETERMINATE":
                if isinstance(widget, ProgressBar):
                    # Simulate with a style class
                    if ExpressionEvaluator.to_bool(val):
                        widget.add_class("indeterminate")

    @staticmethod
    def _set_value(widget: Any, val: Any) -> None:
        if isinstance(widget, ProgressBar):
            widget.progress = ExpressionEvaluator.to_double(val)
        elif isinstance(widget, GsSlider):
            widget.value = ExpressionEvaluator.to_double(val)
        elif isinstance(widget, Checkbox):
            widget.value = ExpressionEvaluator.to_bool(val)
        elif isinstance(widget, Switch):
            widget.value = ExpressionEvaluator.to_bool(val)
        elif isinstance(widget, Input):
            widget.value = ExpressionEvaluator.to_str(val)
        elif isinstance(widget, GaugeWidget):
            widget.gauge_value = ExpressionEvaluator.to_double(val)

    @staticmethod
    def _parse_spacing(s: str) -> tuple:
        parts = [p.strip() for p in s.replace(",", " ").split()]
        if len(parts) == 1:
            n = int(parts[0])
            return (n, n, n, n)
        if len(parts) == 2:
            return (int(parts[0]), int(parts[1]), int(parts[0]), int(parts[1]))
        if len(parts) == 4:
            return (int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3]))
        return (0, 0, 0, 0)

    # ── Live bindings (called after mount) ───────────────────────────────────

    def wire_bindings(self, app: "GateSyntaxApp") -> None:
        self._app = app
        self._register_builtin_actions(app)

        for node_id, node in self._node_map.items():
            for p in node.props:
                refs = collect_refs(p.value)
                if not refs:
                    continue
                self._bind_prop(app, node_id, p.key, p.value, refs)

        # Wire LOAD behaviors
        for node_id, behaviors in self._behaviors_map.items():
            for b in behaviors:
                if b.event == "LOAD":
                    self._handle_behavior(b, None)

        self._ready = True   # Open the event gate

    def _bind_prop(self, app: "GateSyntaxApp", node_id: str,
                   key: str, expr, refs: list[str]) -> None:
        def callback(_: Any) -> None:
            val = self._eval.evaluate(expr)
            try:
                widget = app.query_one(f"#{node_id}")
                self._apply_live_prop(app, widget, node_id, key, val)
            except Exception:
                pass

        for ref in refs:
            self._store.subscribe(ref, callback)
        # Fire immediately
        callback(None)

    def _apply_live_prop(self, app: "GateSyntaxApp", widget: Any,
                         nid: str, key: str, val: Any) -> None:
        match key:
            case "TEXT":
                if isinstance(widget, (Label, Static)):
                    widget.update(str(val))
            case "LABEL":
                if isinstance(widget, Label):
                    widget.update(str(val))
                elif isinstance(widget, Button):
                    widget.label = str(val)
            case "VALUE":
                app._updating.add(nid)
                try:
                    self._set_value(widget, val)
                finally:
                    app._updating.discard(nid)
            case "ENABLED":
                widget.disabled = not ExpressionEvaluator.to_bool(val)
            case "VISIBLE":
                widget.display = ExpressionEvaluator.to_bool(val)
            case "TITLE":
                app.title = str(val)

    # ── Event dispatch ────────────────────────────────────────────────────────

    def handle_event(self, widget_id: str, event: str,
                     element_value: Any = None) -> None:
        if not self._ready:
            return  # Ignore transient events fired during composition/mounting
        for b in self._behaviors_map.get(widget_id, []):
            if b.event == event:
                self._handle_behavior(b, element_value)

    def _handle_behavior(self, b: Behavior, element_value: Any) -> None:
        if b.target_var == "__noop__":
            return

        if b.expression:
            refs = collect_refs(SyntaxParser.parse_value_expr(b.expression))
            # If expression references a widget ID, use the element_value
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

    def _register_builtin_actions(self, app: "GateSyntaxApp") -> None:
        def msg_info():
            msg = ExpressionEvaluator.to_str(self._store.get("DIALOG_MSG") or "Info")
            app.notify(msg, title="Info", severity="information")
            self._store.set("DIALOG_MSG_RESULT", "OK")

        def msg_warn():
            msg = ExpressionEvaluator.to_str(self._store.get("DIALOG_MSG") or "Warning")
            app.notify(msg, title="Warning", severity="warning")
            self._store.set("DIALOG_MSG_RESULT", "OK")

        def msg_error():
            msg = ExpressionEvaluator.to_str(self._store.get("DIALOG_MSG") or "Error")
            app.notify(msg, title="Error", severity="error")
            self._store.set("DIALOG_MSG_RESULT", "OK")

        def msg_confirm():
            msg = ExpressionEvaluator.to_str(self._store.get("DIALOG_MSG") or "Confirm?")
            app.notify(f"[Confirm] {msg}", title="Confirm", severity="warning")
            self._store.set("DIALOG_MSG_RESULT", "True")

        async def async_start_worker():
            self._store.set("ASYNC_STATUS", "Running")
            for i in range(0, 101, 5):
                self._store.set("ASYNC_PROGRESS", i)
                await asyncio.sleep(0.1)
            self._store.set("ASYNC_STATUS", "Done")
            self._store.set("ASYNC_PROGRESS", 100)

        def async_start():
            app.run_worker(async_start_worker(), exclusive=True)

        def clip_copy():
            text = ExpressionEvaluator.to_str(self._store.get("CLIP_TEXT") or "")
            app.copy_to_clipboard(text)
            app.notify("Copied to clipboard")

        self._actions.update({
            "MSG_INFO": msg_info,
            "MSG_WARN": msg_warn,
            "MSG_ERROR": msg_error,
            "MSG_CONFIRM": msg_confirm,
            "ASYNC_START": async_start,
            "CLIP_COPY": clip_copy,
        })


# ── Textual App ───────────────────────────────────────────────────────────────

class GateSyntaxApp(App):
    """Textual application driven by GateSyntax .ui files."""

    CSS_PATH = "../resources/theme.tcss"

    def __init__(self, runtime: UIRuntime, css_path: str | None = None) -> None:
        super().__init__()
        self._runtime = runtime
        self._root_widget: Any = None
        self._updating: set[str] = set()   # IDs being updated from state (loop guard)
        if css_path:
            self.CSS_PATH = css_path

    def compose(self) -> ComposeResult:
        self._root_widget = self._runtime.build_root_widget()
        self.title = self._runtime._window_title
        yield self._root_widget

    async def on_mount(self) -> None:
        # Add TabPanes to TabbedContent via add_pane() (required in Textual v8)
        for tabs_id, pane_ids in self._runtime._tab_children.items():
            tabs_widget = self.query_one(f"#{tabs_id}", TabbedContent)
            for pane_id in pane_ids:
                pane = self._runtime._widget_map[pane_id]
                await tabs_widget.add_pane(pane)
        self._runtime.wire_bindings(self)

    # ── Event routing ────────────────────────────────────────────────────────

    def on_button_pressed(self, event: Button.Pressed) -> None:
        wid = event.button.id or ""
        self._runtime.handle_event(wid, "CLICK")

    def on_input_changed(self, event: Input.Changed) -> None:
        wid = event.input.id or ""
        if wid not in self._updating:
            self._runtime.handle_event(wid, "CHANGE", event.value)

    def on_checkbox_changed(self, event: Checkbox.Changed) -> None:
        wid = event.checkbox.id or ""
        if wid not in self._updating:
            self._runtime.handle_event(wid, "CHANGE", event.value)

    def on_switch_changed(self, event: Switch.Changed) -> None:
        wid = event.switch.id or ""
        if wid not in self._updating:
            self._runtime.handle_event(wid, "CHANGE", event.value)

    def on_gs_slider_changed(self, event: GsSlider.Changed) -> None:
        wid = event.slider.id or ""
        if wid not in self._updating:
            self._runtime.handle_event(wid, "CHANGE", event.value)

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        wid = event.list_view.id or ""
        self._runtime.handle_event(wid, "CHANGE", event.item.id)
