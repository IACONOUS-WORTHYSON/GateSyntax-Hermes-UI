# GateSyntax / HERMES User Interface

---

```
ISSUE \ DECLASSIFICATION NUMBER 2
THE GATESYNTAX \ HERMES USER INTERFACE
```

**Coded by Claude Code  ֲ·  Designed by IACONOUS WORTHYSON**

---

### ג– YOU ARE HEREBY GRANTED

a piece of an **un-patentable novel architecture** designed by
*Iaconous Worthyson* ג€” published under `LICENSE.md` as an
***as-is*** publication.

**ANY LIABILITY** ג€” code not coming out correctly; libs not aligning;
and more ג€” **IS A *YOU* RESPONSIBILITY.**

---

### ג¨ HOW TO USE THIS

The prompt below is for **Claude Code** ג€” meaning you can simply
`CTRL+C` && `CTRL+V` and then just run it.

Or copy the code using **GIT** and build it using your own fingers
clicking on the computer.

*Here it is:*

---

## What It Is

A single declarative `.ui` file format that runs natively on any platform
without changing a single character of markup.

```
/SPEED :: 50\

WINDOW Root :: TITLE "My App"
SCROLL Main :: IN [Root]
COL    Col  :: IN [Main]

LABEL  SpeedLbl    :: IN [Col] :: TEXT "Speed: " + [SPEED]
SLIDER SpeedSlider :: IN [Col] :: MIN 0 :: MAX 200 :: VALUE [SPEED]
                               :: ON CHANGE /SPEED :: [SpeedSlider]\
BUTTON Reset       :: IN [Col] :: LABEL "Reset"   :: ON CLICK /SPEED :: 0\
```

That file ג€” unchanged ג€” renders in WPF, PyQt, JavaFX, React, and vanilla DOM.
The syntax reads the way you would describe the UI out loud.

> *"I want a slider that goes from 0 to 200"*
> ג†’ `SLIDER Speed :: MIN 0 :: MAX 200 :: VALUE [SPEED]`

---

## The Ecosystem

| Folder | Language | Runtime | Run |
|---|---|---|---|
| `GateSyntax-CSharp` | C# | WPF | `dotnet run` |
| `GateSyntaxPy` | Python | Textual (terminal) | `python main.py` |
| `GateSyntaxPy-Qt` | Python | PyQt6 (desktop) | `python main.py` |
| `GateSyntaxJava` | Java 21 | JavaFX | `mvn javafx:run` |
| `GateSyntaxTS` | TypeScript | React | `npm run dev` |
| `GateSyntaxWebb` | TypeScript | Vanilla DOM | `npm run dev` |
| `GateSyntaxPy-HTML` | Java | JavaFX (alt) | `mvn javafx:run` |

### The Integrador

A domain-agnostic live-binding layer ג€” one per language ג€” in `GateSyntax/`.
Drop it into any running program to get a live GateSyntax control panel
automatically, with no UI code in the host.

```python
ig = GateSyntaxIntegrador()

@ig.expose(min=0, max=200)
def speed() -> float: return _speed

@ig.action(label="Reset")
def reset(): global _speed; _speed = 0

ig.run()
```

Works the same way in C#, Java, JavaScript, TypeScript, and React.

---

## The .ui Syntax ג€” Complete Reference

### Lines

Every `.ui` file is a sequence of lines.
Blank lines and lines starting with `//` or `#` are ignored.

```
// State variable
/VARIABLE_NAME :: default_value\
/VARIABLE_NAME :: default_value :: SAVED\     ג† persists across sessions

// Element
NOUN  ElementId :: PROP value :: PROP value :: ON EVENT /VAR :: expr\
```

Tokens are always separated by ` :: ` (space-colon-colon-space).

### Value Expressions

```
42                     literal number
"hello"                literal string
TRUE  /  FALSE         literal boolean
[VAR_NAME]             live reference ג€” reads from state
[A] + [B]              arithmetic
"Count: " + [COUNT]    string concat
[SCORE] * 2            number arithmetic
```

### All Nouns

| Noun | Maps to | Key props |
|---|---|---|
| `WINDOW` | Root window | `TITLE` |
| `COL` / `STACK` | Vertical layout | ג€” |
| `ROW` | Horizontal layout | ג€” |
| `GRID` | Grid layout | `COLS` |
| `PANEL` | Titled group | `LABEL` |
| `SCROLL` | Scrollable area | ג€” |
| `TABS` | Tab container | ג€” |
| `TAB` | One tab | `LABEL` |
| `LABEL` | Text display | `TEXT` |
| `BUTTON` | Button | `LABEL` |
| `INPUT` | Text field | `HINT` |
| `TEXTAREA` | Multi-line input | ג€” |
| `CHECK` | Checkbox | `LABEL`, `VALUE` |
| `TOGGLE` | Toggle switch | `VALUE` |
| `SLIDER` | Range slider | `MIN`, `MAX`, `VALUE` |
| `PROGRESS` | Progress bar | `MAX`, `VALUE` |
| `GAUGE` | Fill meter | `MAX`, `VALUE`, `GAUGELABEL`, `STROKE` |
| `LIST` | Selectable list | `HEIGHT` |
| `ITEM` | List item | `LABEL` |
| `RULE` / `SEPARATOR` | Horizontal line | ג€” |

### Universal Props (any element)

| Prop | Effect |
|---|---|
| `IN [id]` | Set parent (required) |
| `VALUE` | Initial or live-bound value |
| `ENABLED` | `TRUE`/`FALSE` ג€” enable / disable |
| `VISIBLE` | `TRUE`/`FALSE` ג€” show / hide |
| `WIDTH` / `HEIGHT` | Fixed dimensions |
| `BG` / `COLOR` / `FG` | Background / foreground color |
| `STYLE "h1"` | Style class (`h1`, `h2`, `muted`) |
| `MARGIN` / `PADDING` | Spacing |
| `READONLY` | Lock an input |

### Behaviors

```
ON CLICK  /VAR :: expression\
ON CHANGE /VAR :: expression\
ON LOAD   /VAR :: expression\
```

If `expression` evaluates to a registered action name, the action fires
instead of writing to `VAR`.

Built-in actions: `MSG_INFO`, `MSG_WARN`, `MSG_ERROR`, `MSG_CONFIRM`,
`ASYNC_START`, `CLIP_COPY`.

### Common Patterns

**Slider + live readout**
```
/VOL :: 50\
LABEL  VolLbl :: IN [Col] :: TEXT "Volume: " + [VOL]
SLIDER VolSl  :: IN [Col] :: MIN 0 :: MAX 100 :: VALUE [VOL]
                           :: ON CHANGE /VOL :: [VolSl]\
```

**Counter**
```
/COUNT :: 0\
LABEL CountLbl :: IN [Col] :: TEXT "Count: " + [COUNT]
ROW   BtnRow   :: IN [Col]
BUTTON BtnUp   :: IN [BtnRow] :: LABEL "+" :: ON CLICK /COUNT :: [COUNT] + 1\
BUTTON BtnDown :: IN [BtnRow] :: LABEL "-" :: ON CLICK /COUNT :: [COUNT] + -1\
BUTTON BtnRst  :: IN [BtnRow] :: LABEL "Reset" :: ON CLICK /COUNT :: 0\
```

**Show / hide**
```
/ADVANCED :: FALSE\
TOGGLE AdvToggle :: IN [Col] :: LABEL "Advanced" :: VALUE [ADVANCED]
                             :: ON CHANGE /ADVANCED :: [AdvToggle]\
PANEL  AdvPanel  :: IN [Col] :: VISIBLE [ADVANCED]
```

**Tabs**
```
TABS MainTabs :: IN [Root]
TAB  TabA     :: IN [MainTabs] :: LABEL "General"
TAB  TabB     :: IN [MainTabs] :: LABEL "Advanced"
// Children go IN [TabA] or IN [TabB]
```

---

## Build Your Own

This section is the build guide. It is structured as a **prompt for
Claude Code** ג€” paste it directly into a new Claude Code session to
build a complete GateSyntax runtime in any language you specify.

> **To use:** Open a new folder, start Claude Code, paste everything
> from the horizontal rule below through the end of this file.
> Tell Claude which language and UI toolkit you want.

---

# GateSyntax ג€” Claude Code Build Prompt

You are building a **GateSyntax runtime implementation** from scratch.

Read the pseudocode in each module section below. Translate it into
working code in the language and UI toolkit the user specifies.

---

## Architecture Overview

A GateSyntax runtime has nine modules. They form a strict dependency chain:

```
 1. ValueExpr       ג€” immutable expression types
 2. SyntaxNode      ג€” immutable AST node types
        ג†“
 3. SyntaxParser    ג€” text ג†’ SyntaxNode[]
 4. StateStore      ג€” reactive key-value store
        ג†“
 5. ExpressionEvaluator  ג€” ValueExpr + StateStore ג†’ value
 6. LiveBinding          ג€” which vars does an expression depend on?
        ג†“
 7. UIRuntime       ג€” builds widget tree, wires bindings, dispatches events
        ג†“
 8. GateSyntaxBuilder    ג€” fluent API wrapping everything above
        ג†“
 9. Main entry point
```

**Build in this order. Verify each module before moving to the next.**
A broken parser corrupts everything above it.

---

## Module 1 & 2 ג€” Immutable Data Types

Use the language's best tool for sealed/discriminated types.
All types must be **immutable**.

```
// Value expressions ג€” right-hand side of any property
ValueExpr =
    LiteralExpr  { value }              -- string, number, boolean
  | RefExpr      { varName }            -- [VAR] reads live state
  | BinaryExpr   { left, op, right }    -- arithmetic / concat

// Syntax nodes ג€” one per non-blank, non-comment line in a .ui file
SyntaxNode =
    StateDecl    { name, defaultValue, saved }
  | ElementDecl  { noun, id, props[], behaviors[] }

Property  = { key: string,   value: ValueExpr }
Behavior  = { event: string, targetVar: string, expression: string }
```

**Language guidance:**
- Java ג†’ sealed interfaces + records
- C# / Kotlin ג†’ sealed classes / records
- Python ג†’ dataclasses or attrs, frozen=True
- TypeScript ג†’ discriminated union interfaces
- Rust ג†’ enums with fields

**Verify:** Construct one of each type by hand and print it.

---

## Module 3 ג€” SyntaxParser

Entry point: `parse_content(text) -> SyntaxNode[]`

### Line classification

```
separator  =  " :: "   (space colon colon space ג€” never just ":")

skip if:   line is blank
           line starts with "//"
           line starts with "#"

state line:   trimmed line starts with "/"
element line: everything else
```

### Parsing a state declaration

```
FUNCTION parse_state_decl(tokens) -> StateDecl
    name    = tokens[0] .strip_leading("/") .trim()
    default = tokens[1] .strip_trailing("\\") .trim()   IF len > 1   ELSE ""
    saved   = any token in tokens[2..] equals "SAVED" (case-insensitive)
    RETURN StateDecl(name, parse_literal(default), saved)
```

### Parsing an element declaration

```
FUNCTION parse_element_decl(tokens) -> ElementDecl
    first = tokens[0].trim()
    noun  = text before first space  (upper-cased)
    id    = text after first space   (if no space: noun == id)

    props     = []
    behaviors = []
    i = 1

    WHILE i < len(tokens)
        seg = tokens[i].trim()

        IF seg starts with "ON " (case-insensitive)
            parts     = seg.split_whitespace()  -- ["ON", "EVENT", "/VAR"]
            event     = parts[1].upper()
            targetVar = parts[2].strip_leading("/")
            expr      = tokens[i+1].strip_trailing("\\")   IF i+1 exists   ELSE ""
            i += 1
            behaviors.append(Behavior(event, targetVar, expr))

        ELSE
            key     = text before first space (upper-cased)
            val_str = text after first space  (if no space: val_str = "true")
            props.append(Property(key, parse_value_expr(val_str)))

        i += 1

    RETURN ElementDecl(noun, id, props, behaviors)
```

### Value expression parser

```
FUNCTION parse_value_expr(s) -> ValueExpr
    parts = tokenize_expr(s.trim())
    IF empty         -> RETURN LiteralExpr("")
    IF one part      -> RETURN parse_single_token(parts[0])
    -- build left-associative binary chain
    left = parse_single_token(parts[0])
    i = 1
    WHILE i < len(parts) - 1
        left = BinaryExpr(left, parts[i], parse_single_token(parts[i+1]))
        i += 2
    RETURN left

FUNCTION tokenize_expr(s) -> string[]
    -- Split on spaces; respect "quoted strings" and [VAR] brackets
    buf = ""
    in_quote = false
    in_ref   = false
    FOR each char:
        '"'  ->  in_quote = !in_quote;  buf += char
        '['  ->  in_ref = true;         buf += char
        ']'  ->  in_ref = false;        buf += char
        ' '  IF not in_quote AND not in_ref
             ->  flush buf to result
        _    ->  buf += char
    flush buf if not empty

FUNCTION parse_single_token(t) -> ValueExpr
    IF t starts with "[" AND ends with "]"
        RETURN RefExpr(t stripped of brackets)
    RETURN LiteralExpr(parse_literal(t))

FUNCTION parse_literal(s) -> any
    strip surrounding quotes -> return inner string
    "TRUE" / "FALSE"         -> return boolean
    valid integer            -> return int
    valid decimal            -> return float
    fallback                 -> return raw string
```

**Verify:**
```
Input:
  /SPEED :: 50\
  SLIDER SpeedSl :: IN [Root] :: MIN 0 :: MAX 100 :: VALUE [SPEED] :: ON CHANGE /SPEED :: [SpeedSl]\

Expected output:
  StateDecl   { name: "SPEED", defaultValue: 50 }
  ElementDecl { noun: "SLIDER", id: "SpeedSl",
                props: [ IN [Root], MIN 0, MAX 100, VALUE [SPEED] ],
                behaviors: [ ON CHANGE -> SPEED <- [SpeedSl] ] }
```

---

## Module 4 ג€” StateStore

A reactive key-value store. Keys are always UPPER-CASED internally.

```
STATE_STORE
    data:        map<string, any>
    subscribers: map<string, list<fn(value)>>

set(name, value)
    key = name.upper()
    IF data[key] == value: RETURN        -- no-op: value unchanged
    data[key] = value
    FOR each callback IN subscribers[key]
        callback(value)                  -- fire OUTSIDE any lock

get(name, default = "") -> any
    RETURN data[name.upper()]  IF exists  ELSE default

set_default(name, value)
    IF name.upper() NOT in data: data[name.upper()] = value

subscribe(name, fn)
    subscribers[name.upper()].append(fn)
```

> In multi-threaded languages (Java, C#, Python): lock `data` and
> `subscribers` during reads/writes. Copy the subscriber list, then
> fire callbacks **after** releasing the lock.

**Verify:**
```
store.set("X", 1)
store.subscribe("X", v -> assert v == 2)
store.set("X", 2)   -- triggers subscriber ג“
store.set("X", 2)   -- no-op, does NOT trigger again ג“
```

---

## Module 5 ג€” ExpressionEvaluator

```
evaluate(expr, store) -> any
    LiteralExpr(value)          -> return value
    RefExpr(varName)            -> return store.get(varName)
    BinaryExpr(left, op, right) ->
        l = evaluate(left,  store)
        r = evaluate(right, store)
        return apply_op(l, op, r)

apply_op(l, op, r) -> any
    "+"  -> if either is string: to_string(l) + to_string(r)
            else:                to_number(l) + to_number(r)
    "-"  -> to_number(l) - to_number(r)
    "*"  -> to_number(l) * to_number(r)
    "X"  -> to_number(l) * to_number(r)   (alternate multiply)
    "/"  -> r = to_number(r); if r == 0: return 0
            return to_number(l) / r

// Three helpers used everywhere in the runtime:
to_number(v) -> float     -- 0.0 on any failure
to_bool(v)   -> bool      -- "false"/"0"/"no"/"" = false; rest = true
to_string(v) -> string    -- booleans as "True"/"False"
                          -- whole-number floats without ".0"
```

**Verify:**
```
store.set("A", 10)
store.set("B", 5)
evaluate( BinaryExpr(Ref("A"), "+", Ref("B")) )             -> 15
evaluate( BinaryExpr(Literal("Hello "), "+", Ref("A")) )    -> "Hello 10"
```

---

## Module 6 ג€” LiveBinding

One function. Walks an expression tree; returns every variable name found.

```
collect_refs(expr) -> string[]
    RefExpr(name)           -> [name]
    BinaryExpr(left,_,right)-> collect_refs(left) + collect_refs(right)
    LiteralExpr             -> []
```

**Verify:**
```
collect_refs(
    BinaryExpr( Ref("A"), "+",
    BinaryExpr( Ref("B"), "*", Literal(2) ))
) -> ["A", "B"]
```

---

## Module 7 ג€” UIRuntime

The largest module. Four sequential responsibilities.

### 7a ג€” Index the node tree (on construction)

```
FOR each node IN nodes:
    IF node is StateDecl:
        store.set_default(name, defaultValue)
        CONTINUE

    node_map[node.id]      = node
    behaviors_map[node.id] = node.behaviors

    IF node.noun == "WINDOW":
        window_id    = node.id
        window_title = evaluate static TITLE prop
        CONTINUE

    in_prop = find prop where key == "IN"
    IF in_prop.value is RefExpr:
        children_map[in_prop.value.varName].append(node.id)
```

### 7b ג€” Build the widget tree

```
build_root()
    ids     = children_map[window_id]
    widgets = [ build_node(id) for id in ids ]
    if len == 1: return widgets[0]
    return wrap_in_column(widgets)

build_node(id) -> Widget
    node     = node_map[id]
    children = [ build_node(c) for c in children_map[id]
                 if build_node(c) != null ]

    CASE node.noun
        "TABS"        -> special handler: build tab bar + panes
        "LIST"        -> special handler: build list items
        "TAB", "ITEM" -> return null   (consumed by parent)
        _             -> widget = create_widget(node, children)
                         apply_static_props(widget, node)
                         widget_map[id] = widget
                         return widget

create_widget(node, children) -> Widget
    CASE node.noun
        "COL" | "STACK"       -> vertical_layout(children)
        "ROW"                 -> horizontal_layout(children)
        "GRID"                -> grid_layout(children, cols=COLS prop OR 3)
        "PANEL"               -> group_box(LABEL prop, children)
        "SCROLL"              -> scroll_container(children)
        "LABEL"               -> text_widget( evaluate TEXT prop )
        "BUTTON"              -> button = button(LABEL prop)
                                 wire(button, click -> handle_event(id, "CLICK"))
        "INPUT"               -> input = text_input(hint: HINT prop)
                                 wire(input, change -> handle_event(id, "CHANGE", v))
        "CHECK"               -> check = checkbox(LABEL prop)
                                 wire(check, change -> handle_event(id, "CHANGE", v))
        "TOGGLE"              -> toggle = toggle_switch()
                                 wire(toggle, change -> handle_event(id, "CHANGE", v))
        "SLIDER"              -> slider = slider(MIN prop, MAX prop)
                                 wire(slider, change -> handle_event(id, "CHANGE", v))
        "PROGRESS"            -> progress_bar(max: MAX prop)
        "GAUGE"               -> gauge(max, label, color from GAUGELABEL/STROKE props)
        "RULE" | "SEPARATOR"  -> horizontal_rule()
        "TEXTAREA"            -> multi_line_input()
        _                     -> fallback_container(children)
```

### 7c ג€” Wire live bindings (call after widget tree is mounted)

```
FOR each (id, node) IN node_map:
    FOR each prop IN node.props:
        refs = collect_refs(prop.value)
        IF refs is empty: CONTINUE

        -- close over id, prop.key, prop.value
        update = FUNCTION():
            val = evaluate(prop.value, store)

            IF id == window_id:
                IF prop.key == "TITLE": window.title = to_string(val)
                RETURN

            widget = widget_map[id]
            IF widget is null: RETURN
            apply_live_prop(widget, id, prop.key, val)

        FOR each ref IN refs:
            store.subscribe(ref, _ -> update())

        update()    -- prime immediately

apply_live_prop(widget, id, key, val)
    "TEXT" | "LABEL" -> widget.text    = to_string(val)
    "VALUE"          -> mark_updating(id)
                        set_widget_value(widget, val)
                        unmark_updating(id)
    "ENABLED"        -> widget.enabled = to_bool(val)
    "VISIBLE"        -> widget.visible = to_bool(val)

// Guard: prevents a VALUE update from firing the widget's change event
//        back into the store, causing an infinite loop.
updating = set<string>
mark_updating(id)   updating.add(id)
unmark_updating(id) updating.remove(id)
```

### 7d ג€” Event dispatch

```
handle_event(widget_id, event, element_value = null)
    IF widget_id IN updating: RETURN    -- re-entrant; skip

    FOR each behavior IN behaviors_map[widget_id]:
        IF behavior.event != event: CONTINUE
        IF behavior.targetVar == "__noop__": CONTINUE

        IF behavior.expression is not empty:
            refs = collect_refs( parse_value_expr(behavior.expression) )
            IF refs point to widget IDs AND element_value != null:
                val = element_value
            ELSE:
                val = evaluate( parse_value_expr(behavior.expression), store )
        ELSE:
            val = element_value OR ""

        key = to_string(val).upper()
        IF key IN registered_actions:
            registered_actions[key]()
            RETURN

        store.set(behavior.targetVar, val)
```

**Built-in actions to register at startup:**

| Key | Behavior |
|---|---|
| `MSG_INFO` | Show info notification; set `DIALOG_MSG_RESULT = "OK"` |
| `MSG_WARN` | Show warning notification; set result |
| `MSG_ERROR` | Show error notification; set result |
| `MSG_CONFIRM` | Show confirm; set `DIALOG_MSG_RESULT = "True"` |
| `ASYNC_START` | Background task: push `ASYNC_PROGRESS` 0ג†’100 over ~2s, set `ASYNC_STATUS` |
| `CLIP_COPY` | Copy `CLIP_TEXT` to system clipboard |

**Verify the full module:**
Load `UI/controls.ui`. Moving the slider must update both the label
and the progress bar live ג€” no code beyond the `.ui` file.

---

## Module 8 ג€” GateSyntaxBuilder (Fluent API)

```
BUILDER fields:
    sources:  list of { content, name }
    css_path: string
    actions:  map<string, fn>

add_file(path)
    sources.append({ content: read(path), name: filename(path) })
    return self

add_directory(path)
    load main.ui first, then remaining *.ui alphabetically
    return self

with_css(path)
    css_path = path
    return self

register_action(name, fn)
    actions[name.upper()] = fn
    return self

build() -> App
    store = new StateStore()
    nodes = parse_content(each source)
    for each StateDecl: store.set_default(name, defaultValue)
    runtime = UIRuntime(nodes, store)
    for each (name, fn) in actions: runtime.register_action(name, fn)
    return App(runtime, css_path)

build_with_state() -> (App, StateStore)
    same as build(), also return the store
```

---

## Module 9 ג€” Entry Point

```
ui_dir  = <project_root>/UI
css     = <project_root>/resources/theme.<ext>

GateSyntaxBuilder()
    .add_directory(ui_dir)
    .with_css(css)
    .build()
    .run()
```

---

## The Integrador (Optional Extension)

Wraps any running program. Auto-generates `.ui` from exposed bindings.
Host program needs no UI knowledge.

```
BINDING { name, label, getter, setter, action, min, max, type }
types:  "number" | "bool" | "string" | "action"

generate_ui(bindings, title) -> string
    -- number  -> /GS_VAR :: value\  +  LABEL + SLIDER
    -- bool    -> /GS_VAR :: value\  +  TOGGLE
    -- string  -> /GS_VAR :: value\  +  LABEL + INPUT
    -- action  -> BUTTON with ON CLICK -> "CALL_NAME"

run(bindings)
    app, store = build_from_content(generate_ui(bindings))
    for each binding with setter:
        store.subscribe("GS_" + name, v -> setter(v))   -- UI ג†’ host
    start background loop at poll_hz:
        for each binding with getter:
            store.set("GS_" + name, getter())            -- host ג†’ UI
    app.run()
```

---

## Project Structure

```
<ImplementationName>/
  <build file>          pom.xml / package.json / .csproj / pyproject.toml
  core/                 source files
  resources/
    theme.<css|qss>     dark theme (see colors below)
  UI/
    main.ui             WINDOW + TABS shell
    controls.ui         slider ג†” progress, checkbox, toggle
    binding.ui          two-way inputs, live preview, counter
    commands.ui         notifications, async worker, gauge
    data.ui             list selection, multi-gauge panel
```

**Dark theme target colors:**
```
background  #1a1a2e     surface   #22223a     border    #44447a
primary     #6688cc     accent    #88aadd     text      #e0e0e0
muted       #888888     success   #55cc77     error     #ff5555
```

Style class `STYLE "h1"` ג†’ bold, primary color, larger font.
Style class `STYLE "h2"` ג†’ bold, accent color.
Style class `STYLE "muted"` ג†’ muted color.

---

## Validation Checklist

Before the implementation is complete, every item below must pass.

- [ ] Slider updates label and progress bar live
- [ ] 0% / 50% / 100% buttons snap the slider
- [ ] Checkbox text reflects `TRUE`/`FALSE` live
- [ ] Typing in Name field updates preview label instantly
- [ ] Counter `+` / `גˆ’` buttons work; Reset returns to 0
- [ ] Start async task animates progress bar 0 ג†’ 100
- [ ] Info / Warn / Error buttons trigger notifications
- [ ] Gauge slider drives gauge widget live
- [ ] Clicking a list item updates the "Selected:" label
- [ ] CPU + / CPU גˆ’ buttons update the CPU gauge live
- [ ] Window title matches the `APP_TITLE` state variable
- [ ] No restart needed to see any of the above

---

## Common Mistakes

**Parser**
- Splitting on `:` not ` :: ` ג€” breaks colons inside string values
- Forgetting to strip the trailing `\` from state decls and behavior exprs
- Not handling the case where NOUN and ID are the same word (no space)

**StateStore**
- Firing subscribers when value did not change ג†’ infinite loop
- Holding the lock while firing subscribers ג†’ deadlock

**Live bindings**
- Calling `wire_bindings` before the widget tree is fully mounted
- Forgetting the `updating` guard ג†’ slider moves ג†’ store.set ג†’ slider moves ג†’ גˆ

**Event dispatch**
- Evaluating the behavior expression before checking for action names
  (action names are string literals like `"MSG_INFO"`, not `[VAR]` refs)

**TABS**
- Building TAB child content before the TabPane exists in the toolkit parent

---

*Implement modules 1 ג€“ 9 in any language with any UI toolkit
and you have a complete, portable GateSyntax runtime.*

