# GateSyntax — Implementation Specification
> Pseudocode reference for implementing GateSyntax in any language.

---

## 1. The .ui File Format

A `.ui` file is a sequence of lines. Each line is either a **state declaration**
or an **element declaration**. Blank lines and lines beginning with `//` or `#`
are ignored.

```
// State declaration  — begins with /
/VARIABLE_NAME :: default_value\

// Element declaration
NOUN  ElementId :: PROP value :: PROP value :: ON EVENT /VAR :: expr\
```

Tokens on each line are separated by ` :: ` (space-colon-colon-space).

---

## 2. Core Data Types

### 2.1 Value Expression
A value that can appear on the right-hand side of any property.

```
ValueExpr =
    LiteralExpr  { value: any }              -- a string, number, or boolean
  | RefExpr      { varName: string }         -- [VAR_NAME] — reads live state
  | BinaryExpr   { left: ValueExpr,
                   op:   "+" | "-" | "*" | "/",
                   right: ValueExpr }
```

### 2.2 Syntax Nodes
```
SyntaxNode =
    StateDecl   { name: string,
                  defaultValue: any,
                  saved: bool }              -- /NAME :: default :: SAVED\

  | ElementDecl { noun: string,              -- BUTTON, LABEL, SLIDER …
                  id:   string,
                  props: list of Property,
                  behaviors: list of Behavior }

Property  = { key: string, value: ValueExpr }

Behavior  = { event:     string,             -- CLICK | CHANGE | LOAD
              targetVar: string,             -- variable to write to
              expression: string }           -- what to write (as raw string)
```

---

## 3. The Parser

```
FUNCTION parse_file(path) -> list of SyntaxNode
    text = read_file(path)
    RETURN parse_content(text)

FUNCTION parse_content(text) -> list of SyntaxNode
    nodes = []
    FOR each line IN text.split_lines()
        line = line.trim()
        IF line is empty OR line starts with "//" OR line starts with "#"
            CONTINUE
        node = parse_line(line)
        IF node is not null
            nodes.append(node)
    RETURN nodes

FUNCTION parse_line(line) -> SyntaxNode
    tokens = line.split(" :: ")
    IF tokens[0].trimmed starts with "/"
        RETURN parse_state_decl(tokens)
    ELSE
        RETURN parse_element_decl(tokens)

FUNCTION parse_state_decl(tokens) -> StateDecl
    name    = tokens[0].strip_leading("/").trim()
    default = tokens[1].strip_trailing("\\").trim()  IF len > 1  ELSE ""
    saved   = any token in tokens[2..] equals "SAVED" (case-insensitive)
    RETURN StateDecl(name, parse_literal(default), saved)

FUNCTION parse_element_decl(tokens) -> ElementDecl
    first_token = tokens[0].trim()
    noun, id    = split first_token on first space
                  IF no space: noun = id = first_token

    props     = []
    behaviors = []
    i = 1

    WHILE i < len(tokens)
        segment = tokens[i].trim()

        IF segment starts with "ON " (case-insensitive)
            parts     = segment.split_whitespace()  -- ["ON", "EVENT", "/VAR"]
            event     = parts[1].upper()
            targetVar = parts[2].strip_leading("/")
            expr      = tokens[i+1].strip_trailing("\\")  IF i+1 exists  ELSE ""
            i += 1
            behaviors.append(Behavior(event, targetVar, expr))

        ELSE
            key, val_str = split segment on first space
                           IF no space: key = segment, val_str = "true"
            props.append(Property(key.upper(), parse_value_expr(val_str)))

        i += 1

    RETURN ElementDecl(noun.upper(), id, props, behaviors)
```

### 3.1 Value Expression Parser

```
FUNCTION parse_value_expr(s) -> ValueExpr
    tokens = tokenize_expr(s.trim())
    IF tokens is empty        RETURN LiteralExpr("")
    IF len(tokens) == 1       RETURN parse_single_token(tokens[0])

    left = parse_single_token(tokens[0])
    i    = 1
    WHILE i < len(tokens) - 1
        op    = tokens[i]
        right = parse_single_token(tokens[i+1])
        left  = BinaryExpr(left, op, right)
        i += 2
    RETURN left

FUNCTION tokenize_expr(s) -> list of string
    -- Splits on spaces, but respects quoted strings and [VAR] references
    result   = []
    buf      = ""
    in_quote = false
    in_ref   = false
    FOR each char IN s
        CASE char
            '"'               -> in_quote = !in_quote;  buf += char
            '['               -> in_ref   = true;       buf += char
            ']'               -> in_ref   = false;      buf += char
            ' ' IF not in_quote AND not in_ref
                              -> IF buf not empty: result.append(buf); buf = ""
            _                 -> buf += char
    IF buf not empty: result.append(buf)
    RETURN result

FUNCTION parse_single_token(t) -> ValueExpr
    t = t.trim()
    IF t starts with "[" AND ends with "]"
        RETURN RefExpr(t[1..-2])         -- strip brackets → variable name
    RETURN LiteralExpr(parse_literal(t))

FUNCTION parse_literal(s) -> any
    s = s.trim().strip_trailing("\\")
    IF s starts with '"' AND ends with '"'  RETURN s[1..-2]  -- string
    IF s.upper() == "TRUE"                  RETURN true
    IF s.upper() == "FALSE"                 RETURN false
    IF s is a valid integer                 RETURN int(s)
    IF s is a valid decimal                 RETURN float(s)
    RETURN s                                -- fallback: raw string
```

---

## 4. The State Store

A reactive key-value store. All keys are normalized to UPPER_CASE.
Subscribers are notified synchronously when a value changes.

```
STATE_STORE
    data:        map of string -> any
    subscribers: map of string -> list of function(value)

FUNCTION set(name, value)
    key = name.upper()
    IF data[key] == value: RETURN     -- no-op: value unchanged
    data[key] = value
    FOR each callback IN subscribers[key]
        callback(value)

FUNCTION get(name, default = "") -> any
    RETURN data[name.upper()]  IF exists  ELSE default

FUNCTION set_default(name, value)
    key = name.upper()
    IF key not in data: data[key] = value

FUNCTION subscribe(name, callback)
    -- callback(value) is called whenever name changes
    subscribers[name.upper()].append(callback)
```

> **Thread safety:** In multi-threaded runtimes (Java, Python, C#) protect
> `data` and `subscribers` with a lock. Fire callbacks *outside* the lock
> to prevent deadlocks.

---

## 5. The Expression Evaluator

```
FUNCTION evaluate(expr, store) -> any
    CASE expr
        LiteralExpr(value)          -> RETURN value
        RefExpr(varName)            -> RETURN store.get(varName)
        BinaryExpr(left, op, right) ->
            l = evaluate(left, store)
            r = evaluate(right, store)
            RETURN apply_op(l, op, r)

FUNCTION apply_op(l, op, r) -> any
    CASE op
        "+"  -> IF either is string: RETURN to_string(l) + to_string(r)
                ELSE:                RETURN to_number(l) + to_number(r)
        "-"  -> RETURN to_number(l) - to_number(r)
        "*"  -> RETURN to_number(l) * to_number(r)
        "/"  -> r = to_number(r)
                RETURN to_number(l) / r  IF r != 0  ELSE 0
        "X"  -> RETURN to_number(l) * to_number(r)   -- alternate multiply
```

### 5.1 Type Coercion Helpers

```
FUNCTION to_number(v) -> float
    IF v is number:  RETURN v as float
    TRY parse float from string(v)
    ON FAIL:         RETURN 0.0

FUNCTION to_bool(v) -> bool
    IF v is bool:    RETURN v
    IF v is number:  RETURN v != 0
    RETURN string(v).lower() NOT IN ["", "false", "0", "no"]

FUNCTION to_string(v) -> string
    IF v is bool:    RETURN "True" or "False"
    IF v is number with no fractional part: RETURN int string
    RETURN string representation of v
```

---

## 6. Live Binding

Determines which state variables an expression depends on, so the
runtime knows which bindings to refresh when state changes.

```
FUNCTION collect_refs(expr) -> list of string
    CASE expr
        RefExpr(varName)              -> RETURN [varName]
        BinaryExpr(left, _, right)    -> RETURN collect_refs(left)
                                              + collect_refs(right)
        _                             -> RETURN []
```

---

## 7. The Widget Runtime

### 7.1 Initialization

```
FUNCTION build_runtime(nodes, store)
    node_map      = {}     -- id -> ElementDecl
    children_map  = {}     -- parent_id -> [child_id, ...]
    behaviors_map = {}     -- id -> [Behavior, ...]
    window_id     = ""
    window_title  = "GateSyntax"

    FOR each node IN nodes
        IF node is StateDecl
            store.set_default(node.name, node.defaultValue)
            CONTINUE

        -- node is ElementDecl
        node_map[node.id]     = node
        behaviors_map[node.id] = node.behaviors

        IF node.noun == "WINDOW"
            window_id = node.id
            title_prop = find prop with key "TITLE" in node.props
            IF title_prop exists AND no refs in title_prop.value
                window_title = evaluate(title_prop.value, store)
            CONTINUE

        in_prop = find prop with key "IN" in node.props
        IF in_prop exists AND in_prop.value is RefExpr
            parent_id = in_prop.value.varName
            children_map[parent_id].append(node.id)
```

### 7.2 Building the Widget Tree

```
FUNCTION build_root(node_map, children_map, window_id, store)
    root_children = children_map[window_id]
    widgets = [ build_node(id) FOR id IN root_children ]
    IF len(widgets) == 1: RETURN widgets[0]
    RETURN wrap_in_column(widgets)

FUNCTION build_node(id) -> Widget
    node      = node_map[id]
    child_ids = children_map[id]

    -- Special containers that manage their own children
    IF node.noun == "TABS":  RETURN build_tabs(node, child_ids)
    IF node.noun == "LIST":  RETURN build_list(node, child_ids)
    IF node.noun == "TAB":   RETURN null      -- consumed by TABS
    IF node.noun == "ITEM":  RETURN null      -- consumed by LIST

    children = [ build_node(cid) FOR cid IN child_ids  IF build_node(cid) != null ]
    widget   = create_widget(node, children, store)
    apply_static_props(widget, node, store)
    register(id, widget)
    RETURN widget
```

### 7.3 Widget Factory

```
FUNCTION create_widget(node, children, store) -> Widget
    label = first static "LABEL" or "TEXT" prop value  OR  ""

    CASE node.noun
        "COL" | "STACK"      -> RETURN vertical_layout(children)
        "ROW"                -> RETURN horizontal_layout(children)
        "GRID"               -> cols = static_prop(node, "COLS") OR 3
                                RETURN grid_layout(children, cols)
        "PANEL"              -> RETURN group_box(label, children)
        "SCROLL"             -> RETURN scroll_container(children)

        "LABEL"              -> RETURN text_widget(eval_prop(node, "TEXT", store))
        "BUTTON"             -> widget = button(label)
                                wire(widget, "click",
                                     -> handle_event(node.id, "CLICK"))
                                RETURN widget
        "INPUT"              -> widget = text_input(hint: static_prop(node, "HINT"))
                                wire(widget, "change",
                                     (v) -> handle_event(node.id, "CHANGE", v))
                                RETURN widget
        "CHECK"              -> widget = checkbox(label)
                                wire(widget, "change",
                                     (v) -> handle_event(node.id, "CHANGE", v))
                                RETURN widget
        "TOGGLE"             -> widget = toggle_switch()
                                wire(widget, "change",
                                     (v) -> handle_event(node.id, "CHANGE", v))
                                RETURN widget
        "SLIDER"             -> min = static_prop(node, "MIN") OR 0
                                max = static_prop(node, "MAX") OR 100
                                widget = slider(min, max)
                                wire(widget, "change",
                                     (v) -> handle_event(node.id, "CHANGE", v))
                                RETURN widget
        "PROGRESS"           -> max = static_prop(node, "MAX") OR 100
                                RETURN progress_bar(max)
        "GAUGE"              -> RETURN gauge(
                                    max:   static_prop(node, "MAX")   OR 100,
                                    label: static_prop(node, "GAUGELABEL") OR "",
                                    color: static_prop(node, "STROKE") OR default_color)
        "SEPARATOR" | "RULE" -> RETURN horizontal_rule()
        "TEXTAREA"           -> RETURN multi_line_input()
        _                    -> RETURN fallback_container(children)
```

### 7.4 Applying Static Properties

```
FUNCTION apply_static_props(widget, node, store)
    skip_keys = { "IN", "LABEL", "TEXT", "HINT", "MIN", "MAX",
                  "GAUGELABEL", "STROKE", "COLS", "ROWS" }

    FOR each prop IN node.props
        IF prop.key IN skip_keys:  CONTINUE
        IF collect_refs(prop.value) is not empty: CONTINUE   -- live; handle later
        val = evaluate(prop.value, store)
        apply_prop(widget, prop.key, val)

FUNCTION apply_prop(widget, key, val)
    CASE key
        "VALUE"       -> set_widget_value(widget, val)
        "ENABLED"     -> widget.enabled  = to_bool(val)
        "VISIBLE"     -> widget.visible  = to_bool(val)
        "WIDTH"       -> widget.width    = to_number(val)
        "HEIGHT"      -> widget.height   = to_number(val)
        "BG"          -> widget.background = resolve_color(val)
        "COLOR" | "FG"-> widget.foreground = resolve_color(val)
        "STYLE"       -> apply_style_classes(widget, val)
        "MARGIN"      -> widget.margin   = parse_spacing(val)
        "PADDING"     -> widget.padding  = parse_spacing(val)
        "READONLY"    -> widget.readonly = to_bool(val)
```

---

## 8. Wiring Live Bindings

Called once after the widget tree is mounted. For every property that
contains a `[VAR]` reference, subscribe to those variables in the store
and update the widget when they change.

```
FUNCTION wire_bindings(node_map, store, widget_map, window)
    FOR each (id, node) IN node_map
        FOR each prop IN node.props
            refs = collect_refs(prop.value)
            IF refs is empty: CONTINUE

            -- Capture for closure
            local_id   = id
            local_key  = prop.key
            local_expr = prop.value

            update_fn = FUNCTION()
                val    = evaluate(local_expr, store)

                IF local_id == window_id
                    IF local_key == "TITLE": window.title = to_string(val)
                    RETURN

                widget = widget_map[local_id]
                IF widget is null: RETURN
                apply_live_prop(widget, local_id, local_key, val)

            FOR each ref IN refs
                store.subscribe(ref, (_) -> update_fn())

            update_fn()   -- fire immediately to set initial live values

FUNCTION apply_live_prop(widget, id, key, val)
    CASE key
        "TEXT" | "LABEL" -> widget.text  = to_string(val)
        "VALUE"          ->
            mark_updating(id)
            set_widget_value(widget, val)
            unmark_updating(id)
        "ENABLED"        -> widget.enabled = to_bool(val)
        "VISIBLE"        -> widget.visible = to_bool(val)

-- Prevents VALUE change events from looping back into the store
updating = set of ids currently being updated programmatically

FUNCTION mark_updating(id)   updating.add(id)
FUNCTION unmark_updating(id) updating.remove(id)
```

---

## 9. Event Dispatch

```
FUNCTION handle_event(widget_id, event, element_value = null)
    IF widget_id IN updating: RETURN    -- suppress re-entrant events

    FOR each behavior IN behaviors_map[widget_id]
        IF behavior.event != event: CONTINUE

        IF behavior.targetVar == "__noop__": CONTINUE

        -- Resolve the value to write
        IF behavior.expression is not empty
            refs = collect_refs(parse_value_expr(behavior.expression))
            IF refs refer to widget IDs AND element_value is not null
                val = element_value
            ELSE
                val = evaluate(parse_value_expr(behavior.expression), store)
        ELSE
            val = element_value  IF not null  ELSE ""

        -- Check if val is an action name
        val_str = to_string(val).upper()
        IF val_str IN registered_actions
            registered_actions[val_str]()
            RETURN

        store.set(behavior.targetVar, val)
```

---

## 10. The Integrador Pattern

The Integrador wraps any host program and auto-generates `.ui` content
from its exposed state and functions. No UI knowledge required in the host.

```
INTEGRADOR
    bindings: list of Binding
    poll_hz:  number = 30

BINDING
    name:   string
    label:  string
    getter: function() -> any         -- reads from host
    setter: function(any)             -- writes to host
    action: function()                -- callable (no args)
    min, max: number                  -- for numeric sliders
    type:   "number" | "bool" | "string" | "action"

FUNCTION generate_ui(integrador, title) -> string
    lines = [
        WINDOW Root :: TITLE "{title}",
        SCROLL MainScroll :: IN [Root],
        COL    MainCol    :: IN [MainScroll]
    ]

    FOR each binding IN integrador.bindings
        var = "GS_" + binding.name.upper()

        CASE binding.type
            "action"  ->
                lines += BUTTON {name}Btn :: IN [MainCol]
                              :: LABEL "▶  {binding.label}"
                              :: ON CLICK /{var}_CALL :: "CALL_{name}"

            "number"  ->
                lines += /{var} :: {binding.getter()}
                lines += LABEL  {name}Lbl :: TEXT "{binding.label}:  " + [{var}]
                lines += SLIDER {name}Sl  :: MIN {binding.min} :: MAX {binding.max}
                                          :: VALUE [{var}]
                                          :: ON CHANGE /{var} :: [{name}Sl]

            "bool"    ->
                lines += /{var} :: {binding.getter()}
                lines += TOGGLE {name}Tog :: LABEL "{binding.label}"
                                          :: VALUE [{var}]
                                          :: ON CHANGE /{var} :: [{name}Tog]

            "string"  ->
                lines += /{var} :: "{binding.getter()}"
                lines += LABEL  {name}Lbl :: TEXT "{binding.label}"
                lines += INPUT  {name}In  :: ON CHANGE /{var} :: [{name}In]

    RETURN lines.join("\n")

FUNCTION run_integrador(integrador)
    ui   = generate_ui(integrador, title)
    app  = build_from_content(ui)
    store = app.state_store

    -- UI → host: when state changes, call setter
    FOR each binding IN integrador.bindings
        IF binding.setter is not null
            var = "GS_" + binding.name.upper()
            store.subscribe(var, (v) -> binding.setter(v))

    -- host → UI: poll getters and push changes to store
    START background loop at integrador.poll_hz hz:
        FOR each binding IN integrador.bindings
            IF binding.getter is not null
                current = binding.getter()
                store.set("GS_" + binding.name.upper(), current)

    app.run()
```

---

## 11. The Builder (Fluent API)

```
BUILDER
    sources:  list of { content: string, name: string }
    css_path: string
    actions:  map of string -> function

FUNCTION add_file(path)      -> Builder
    sources.append({ content: read_file(path), name: filename(path) })
    RETURN self

FUNCTION add_directory(path) -> Builder
    files = glob(path, "*.ui")
    -- main.ui first, then rest alphabetically
    main  = files where name == "main.ui"
    rest  = sort(files where name != "main.ui")
    FOR each file IN (main + rest): add_file(file)
    RETURN self

FUNCTION with_css(path)      -> Builder
    css_path = path
    RETURN self

FUNCTION register_action(name, fn) -> Builder
    actions[name.upper()] = fn
    RETURN self

FUNCTION build() -> App
    store = new StateStore()
    nodes = []

    FOR each source IN sources
        nodes += parse_content(source.content)

    FOR each node IN nodes
        IF node is StateDecl: store.set_default(node.name, node.defaultValue)

    runtime = build_runtime(nodes, store)
    FOR each (name, fn) IN actions: runtime.register_action(name, fn)

    RETURN App(runtime, css_path)
```

---

## 12. Noun Reference

| Noun | Widget | Key props |
|---|---|---|
| `WINDOW` | Root window / scene | `TITLE` |
| `COL` / `STACK` | Vertical container | — |
| `ROW` | Horizontal container | — |
| `GRID` | Grid container | `COLS`, `ROWS` |
| `PANEL` | Titled group box | `LABEL` |
| `SCROLL` | Scrollable container | — |
| `TABS` | Tab container | — |
| `TAB` | Single tab | `LABEL` |
| `LABEL` | Static text | `TEXT` |
| `BUTTON` | Clickable button | `LABEL` |
| `INPUT` | Single-line text input | `HINT` |
| `TEXTAREA` | Multi-line text input | — |
| `CHECK` | Checkbox | `LABEL`, `VALUE` |
| `TOGGLE` | Toggle switch | `VALUE` |
| `SLIDER` | Range slider | `MIN`, `MAX`, `VALUE` |
| `PROGRESS` | Progress bar | `MAX`, `VALUE` |
| `GAUGE` | Custom fill meter | `MAX`, `VALUE`, `GAUGELABEL`, `STROKE` |
| `LIST` | Selectable list | `HEIGHT` |
| `ITEM` | List item | `LABEL` |
| `RULE` / `SEPARATOR` | Horizontal divider | — |

## 13. Universal Props

These apply to any element:

| Prop | Type | Effect |
|---|---|---|
| `IN` | `[id]` | Parent container (required) |
| `VALUE` | any | Initial / live value |
| `ENABLED` | bool | Enables or disables |
| `VISIBLE` | bool | Shows or hides |
| `WIDTH` | number | Fixed width |
| `HEIGHT` | number | Fixed height |
| `BG` | color | Background color |
| `COLOR` / `FG` | color | Foreground / text color |
| `STYLE` | string | Space-separated style class names |
| `MARGIN` | spacing | Outer spacing |
| `PADDING` | spacing | Inner spacing |

## 14. Behavior Syntax

```
ON EVENT /TARGET_VAR :: expression
```

| Event | Fires when |
|---|---|
| `CLICK` | Button pressed |
| `CHANGE` | Input value changed |
| `LOAD` | Element is first mounted |

Expression can reference `[VARS]`, literals, or operators.
If expression resolves to a registered action name, the action is called
instead of writing to the variable.

---

*That is the complete GateSyntax contract. Implement sections 2–9 in any
language and any UI toolkit to get a fully working runtime.*
