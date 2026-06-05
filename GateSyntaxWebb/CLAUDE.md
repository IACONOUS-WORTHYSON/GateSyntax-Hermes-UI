# GateSyntax — Claude Code Build Instructions

You are building a **GateSyntax runtime implementation**.

The full pseudocode specification is in `SPEC.md` — read it first.
Your job is to translate every section of that spec into working code
in whatever language and UI toolkit the user specifies.

---

## What You Are Building

A declarative UI runtime. A `.ui` file like this:

```
/SPEED :: 50\

WINDOW Root :: TITLE "My App"
SCROLL Main :: IN [Root]
COL    Col  :: IN [Main]

LABEL  SpeedLbl    :: IN [Col] :: TEXT "Speed: " + [SPEED]
SLIDER SpeedSlider :: IN [Col] :: MIN 0 :: MAX 200 :: VALUE [SPEED]
                               :: ON CHANGE /SPEED :: [SpeedSlider]\
BUTTON Reset       :: IN [Col] :: LABEL "Reset" :: ON CLICK /SPEED :: 0\
```

...must parse, render, and keep state live without any other code.
The user writes `.ui`. Your runtime handles everything else.

---

## Build Order

Always implement in this exact sequence.
Each module must compile and have a basic test before moving to the next.

```
1. ValueExpr types        (data only — no logic yet)
2. SyntaxNode types       (data only — no logic yet)
3. SyntaxParser           (depends on 1, 2)
4. StateStore             (depends on nothing)
5. ExpressionEvaluator    (depends on 1, 4)
6. LiveBinding            (depends on 1)
7. UIRuntime              (depends on 2, 3, 4, 5, 6 + UI toolkit)
8. GateSyntaxBuilder      (depends on all above)
9. Main entry point       (depends on 8)
```

Do not jump ahead. Do not merge steps. A broken parser makes everything
built on top of it wrong.

---

## Module 1 & 2 — Data Types

Implement `ValueExpr` as a sealed type / discriminated union / sum type
with exactly three variants:

```
LiteralExpr  { value }           — any primitive
RefExpr      { varName }         — [VAR] reference
BinaryExpr   { left, op, right } — arithmetic or concat
```

Implement `SyntaxNode` as a sealed type with exactly two variants:

```
StateDecl    { name, defaultValue, saved }
ElementDecl  { noun, id, props[], behaviors[] }

Property     { key: string, value: ValueExpr }
Behavior     { event: string, targetVar: string, expression: string }
```

Use the language's best tool for this: sealed interfaces + records (Java),
sealed classes (Kotlin/C#), dataclasses (Python), discriminated unions (TS),
sum types (Rust/Haskell). The types must be **immutable**.

**Verify:** Construct one of each type manually and print it. Done.

---

## Module 3 — SyntaxParser

Implement `parse_content(text: string) -> SyntaxNode[]`.

The parser is line-oriented. Process one line at a time.

```
separator = " :: "    ← always space-colon-colon-space

state line   = starts with "/"  after trimming
element line = everything else
blank / "//" / "#"   = skip
```

**State line:**
```
/NAME :: default_value\
        ↑ strip leading /     ↑ strip trailing \
```

**Element line:**
```
NOUN Id :: PROP val :: ON EVENT /VAR :: expr\
↑ split on first space for noun+id
           ↑ each remaining token is a prop or behavior
                        ↑ "ON " prefix = behavior
```

**Value expression parser** (`parse_value_expr`):
1. Tokenize: split on spaces, but respect `"quotes"` and `[brackets]`
2. If one token: return literal or ref
3. If multiple: build left-associative BinaryExpr chain

**Literals:** strip `"quotes"`, parse `TRUE`/`FALSE`, try int, try float,
fall back to raw string.

**Verify:** Parse this exact string and assert the output:
```
/SPEED :: 50\
SLIDER SpeedSl :: IN [Root] :: MIN 0 :: MAX 100 :: VALUE [SPEED] :: ON CHANGE /SPEED :: [SpeedSl]\
```
Expected: one `StateDecl(SPEED, 50)` + one `ElementDecl` with 4 props and 1 behavior.

---

## Module 4 — StateStore

A reactive key-value store. Keys are always stored and looked up
**upper-cased**.

```
set(name, value)          — store value; notify subscribers IF changed
get(name, default?)       — return stored value or default
set_default(name, value)  — set only if key not already present
subscribe(name, fn)       — fn(value) called on every change
```

The equality check in `set` must prevent infinite loops:
if the new value equals the stored value, do nothing and do not notify.

In multi-threaded languages (Java, C#, Python): protect the internal map
with a lock. Fire subscriber callbacks **outside** the lock.

**Verify:**
```
store.set("X", 1)
store.subscribe("X", v -> assert v == 2)
store.set("X", 2)   ← should trigger subscriber
store.set("X", 2)   ← should NOT trigger again (same value)
```

---

## Module 5 — ExpressionEvaluator

Takes a `ValueExpr` and a `StateStore`, returns a value.

```
evaluate(LiteralExpr)  -> return its value
evaluate(RefExpr)      -> return store.get(varName)
evaluate(BinaryExpr)   -> evaluate left, evaluate right, apply op
```

Operators: `+` `-` `*` `/` `X` (alternate multiply).
For `+`: if either side is a string, concatenate as strings.
Otherwise treat both as numbers.

Provide three static helpers used throughout the runtime:
```
to_number(v)  -> float/double (0.0 on failure)
to_bool(v)    -> bool  ("false"/"0"/"no"/"" = false, rest = true)
to_string(v)  -> string (booleans as "True"/"False", whole floats without ".0")
```

**Verify:**
```
store.set("A", 10)
store.set("B", 5)
eval( BinaryExpr(RefExpr("A"), "+", RefExpr("B")) )  -> 15
eval( BinaryExpr(LiteralExpr("Hello "), "+", RefExpr("A")) ) -> "Hello 10"
```

---

## Module 6 — LiveBinding

One function:

```
collect_refs(expr: ValueExpr) -> string[]
```

Recursively walk the expression tree and return every `RefExpr.varName`
found. Used to know which store subscriptions to create for a given prop.

```
collect_refs(LiteralExpr)        -> []
collect_refs(RefExpr(name))      -> [name]
collect_refs(BinaryExpr(l,_,r))  -> collect_refs(l) + collect_refs(r)
```

**Verify:**
```
collect_refs( BinaryExpr(RefExpr("A"), "+",
              BinaryExpr(RefExpr("B"), "*", LiteralExpr(2))) )
-> ["A", "B"]
```

---

## Module 7 — UIRuntime

This is the largest module. It has four responsibilities:

### 7a. Index the node tree

On construction, walk all nodes and build:
```
node_map:      id -> ElementDecl
children_map:  parent_id -> [child_id, ...]
behaviors_map: id -> [Behavior, ...]
window_id:     string   (the WINDOW node's id)
window_title:  string   (from WINDOW's TITLE prop, evaluated statically)
```

For each `ElementDecl`:
- If `noun == "WINDOW"`: store its id and read TITLE.
- Otherwise: find its `IN [parentId]` prop and register it under that parent.

### 7b. Build the widget tree

`build_root()` → call `build_node(id)` for each child of `window_id`.

`build_node(id)`:
- TABS → special handler (builds tab bar + panes)
- LIST → special handler (builds items)
- TAB / ITEM → return null (consumed by parent)
- everything else → `create_widget(node, children)` then `apply_static_props`

`create_widget` maps nouns to toolkit widgets.
Wire each interactive widget's native change event to `handle_event`.
Use `apply_static_props` for props with no `[VAR]` refs.

### 7c. Wire live bindings

`wire_bindings()` — call after the widget tree is mounted/shown.

For every prop on every node that has at least one `[VAR]` ref:
1. `collect_refs(prop.value)` to find dependencies
2. Create an `update()` closure that evaluates the expression and calls
   `apply_live_prop(widget, id, key, value)`
3. Subscribe `update` to each dependency in the store
4. Call `update()` immediately to prime the initial value

`apply_live_prop` handles: `TEXT`, `LABEL`, `VALUE`, `ENABLED`, `VISIBLE`.
For `VALUE` updates: wrap in `updating.add(id)` / `updating.remove(id)`
to prevent the widget's own change event from firing back into the store.

### 7d. Event dispatch

`handle_event(widget_id, event, element_value?)`:
1. If `widget_id` is in `updating`: return immediately.
2. Find all behaviors for `widget_id` where `behavior.event == event`.
3. For each: evaluate the expression to get `val`.
4. If `to_string(val).upper()` is a registered action name: call the action.
5. Otherwise: `store.set(behavior.targetVar, val)`.

**Built-in actions to register:**
```
MSG_INFO    — show info dialog/notification
MSG_WARN    — show warning
MSG_ERROR   — show error
MSG_CONFIRM — show confirm
ASYNC_START — run background task: 0→100 over ~2s, updating ASYNC_PROGRESS
CLIP_COPY   — copy CLIP_TEXT to clipboard
```

**Verify the whole module:**
Parse and run the controls demo (`UI/controls.ui`). Moving the slider
must update the label and progress bar simultaneously without any
explicit wiring beyond the `.ui` file.

---

## Module 8 — GateSyntaxBuilder

Fluent API. Methods:

```
add_file(path)          — parse one .ui file; add nodes
add_directory(path)     — parse main.ui first, rest alphabetically
with_css(path)          — set stylesheet path
register_action(name,fn)— register a custom action
build()                 — return App
build_with_state()      — return (App, StateStore)
```

`build()` does:
1. Create `StateStore`
2. Parse all sources → `nodes[]`
3. For every `StateDecl` in nodes: `store.set_default(name, defaultValue)`
4. Create `UIRuntime(nodes, store)`
5. Register custom actions on the runtime
6. Return `App(runtime, cssPath)`

---

## Module 9 — Entry Point

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

## The Demo UI Files

Always include these five files in `UI/` so there is something to run
immediately. Copy them from any existing GateSyntax implementation — the
syntax is identical across all of them:

```
UI/main.ui       — WINDOW + TABS shell
UI/controls.ui   — slider ↔ progress, checkbox, toggle
UI/binding.ui    — two-way text inputs, live preview, counter
UI/commands.ui   — notifications, async worker, gauge
UI/data.ui       — list selection, multi-gauge panel
```

---

## The Theme

Implement a dark theme. Target colors:

```
background:   #1a1a2e
surface:      #22223a
border:       #44447a
primary:      #6688cc
accent:       #88aadd
text:         #e0e0e0
muted:        #888888
success:      #55cc77
warn:         #ffaa44
error:        #ff5555
```

Style classes applied by `STYLE "h1"` etc.:

```
h1    — bold, primary color, larger font
h2    — bold, accent color
muted — muted text color
```

---

## Project Structure Convention

```
<ImplementationName>/
  <build file>          pom.xml / package.json / .csproj / pyproject.toml
  core/                 source files (not src/)
    com/gatesyntax/     (Java)   or
    gatesyntax/         (Python) or
    src/                (TS/JS)
  resources/
    theme.<css|qss>
  UI/
    main.ui
    controls.ui
    binding.ui
    commands.ui
    data.ui
```

---

## Validation Checklist

Before calling any implementation complete, confirm all of these:

- [ ] `UI/controls.ui` — slider updates label and progress bar live
- [ ] `UI/controls.ui` — 0% / 50% / 100% buttons snap the slider
- [ ] `UI/controls.ui` — checkbox text reflects TRUE/FALSE live
- [ ] `UI/binding.ui`  — typing in Name field updates preview label instantly
- [ ] `UI/binding.ui`  — counter +/- buttons work; Reset returns to 0
- [ ] `UI/commands.ui` — Start async task animates progress 0→100
- [ ] `UI/commands.ui` — Info/Warn/Error buttons show notifications
- [ ] `UI/commands.ui` — gauge slider drives gauge widget live
- [ ] `UI/data.ui`     — clicking a list item updates "Selected:" label
- [ ] `UI/data.ui`     — CPU+/CPU- buttons update the CPU gauge live
- [ ] Window title matches `APP_TITLE` state variable
- [ ] No restart needed to see any state change

---

## Common Mistakes to Avoid

**Parser**
- Forgetting to strip the trailing `\` from state decls and behavior exprs
- Splitting on `:` instead of ` :: ` (breaks colons inside strings)
- Not handling the case where NOUN and ID are the same token (no space)

**StateStore**
- Firing subscribers when value did not change → infinite loops
- Holding the lock while firing subscribers → deadlock

**Live bindings**
- Calling `wire_bindings` before the widget tree is fully mounted
  (toolkit widgets not yet realized → no-ops)
- Forgetting the `updating` guard → slider moves → store.set → slider moves → ∞

**Event dispatch**
- Evaluating the behavior expression before checking for action names
  (action names are literal strings like `"MSG_INFO"`, not [VAR] refs)

**TABS**
- Building TAB content before the TabPane/Tab container is added to the
  toolkit parent — some toolkits require the parent to exist first

---

## Reference

Full pseudocode for every module: `SPEC.md` in this directory.
Existing working implementations: sibling folders at `D:\IA\GateSyntax*`.
