package com.gatesyntax.runtime;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;

import java.util.*;

/**
 * UIRuntime — builds a JavaFX scene graph from parsed .ui nodes and wires
 * live [VAR] bindings back to the state store.
 * Mirrors GateSyntax.Runtime.UIRuntime.
 */
public class UIRuntime {

    private final Map<String, ElementDecl>  nodeMap      = new LinkedHashMap<>();
    private final Map<String, List<String>> childrenMap  = new LinkedHashMap<>();
    private final Map<String, List<Behavior>> behaviorsMap = new LinkedHashMap<>();
    private final Map<String, Node>         widgetMap    = new HashMap<>();
    private final Map<String, Runnable>     actions      = new HashMap<>();
    private final Map<String, Double>       progressMax  = new HashMap<>();
    private final Set<String>               updating     = new HashSet<>();

    private final StateStore         store;
    private final ExpressionEvaluator eval;

    private String windowId    = "";
    private String windowTitle = "GateSyntaxJava";
    private Stage  stage;
    private boolean ready = false;

    // ── Constructor ───────────────────────────────────────────────────────────

    public UIRuntime(List<SyntaxNode> nodes, StateStore store) {
        this.store = store;
        this.eval  = new ExpressionEvaluator(store);

        for (SyntaxNode n : nodes) {
            if (!(n instanceof ElementDecl el)) continue;
            nodeMap.put(el.id(), el);
            behaviorsMap.put(el.id(), new ArrayList<>(el.behaviors()));

            if ("WINDOW".equals(el.noun())) {
                windowId = el.id();
                el.prop("TITLE").ifPresent(p -> {
                    if (LiveBinding.collectRefs(p.value()).isEmpty())
                        windowTitle = ExpressionEvaluator.toStr(eval.evaluate(p.value()));
                });
                continue;
            }

            el.prop("IN").ifPresent(p -> {
                if (p.value() instanceof RefExpr(var pid))
                    childrenMap.computeIfAbsent(pid, k -> new ArrayList<>()).add(el.id());
            });
        }

        registerBuiltinActions();
        ready = true;

        // Fire LOAD behaviors
        behaviorsMap.forEach((wid, bs) ->
            bs.stream().filter(b -> "LOAD".equals(b.event()))
              .forEach(b -> dispatchBehavior(b, null)));
    }

    private void set(ElementDecl el) { nodeMap.put(el.id(), el); }

    public String getWindowTitle() { return windowTitle; }

    // ── Build scene graph ─────────────────────────────────────────────────────

    public Node buildRoot() {
        List<String> rootChildren = childrenMap.getOrDefault(windowId, List.of());
        if (rootChildren.isEmpty()) return new VBox();

        List<Node> children = buildChildren(rootChildren);
        if (children.size() == 1) return children.get(0);

        VBox root = new VBox(4);
        root.getChildren().addAll(children);
        return root;
    }

    private List<Node> buildChildren(List<String> ids) {
        List<Node> result = new ArrayList<>();
        for (String id : ids) {
            Node n = buildNode(id);
            if (n != null) result.add(n);
        }
        return result;
    }

    private Node buildNode(String id) {
        ElementDecl node = nodeMap.get(id);
        if (node == null) return null;
        List<String> childIds = childrenMap.getOrDefault(id, List.of());

        return switch (node.noun()) {
            case "TABS" -> buildTabs(node, childIds);
            case "LIST" -> buildList(node, childIds);
            case "TAB", "ITEM" -> null; // consumed by TABS / LIST
            default -> buildWidget(node, childIds);
        };
    }

    // ── Widget factory ────────────────────────────────────────────────────────

    private Node buildWidget(ElementDecl node, List<String> childIds) {
        List<Node> children = buildChildren(childIds);
        Node w = createElement(node, children);
        if (w != null) {
            applyStaticProps(w, node);
            widgetMap.put(node.id(), w);
        }
        return w;
    }

    private Node createElement(ElementDecl node, List<Node> children) {
        String noun  = node.noun();
        String id    = node.id();
        String label = staticStr(node, "LABEL").or(() -> staticStr(node, "TEXT")).orElse("");

        return switch (noun) {
            // ── Containers ────────────────────────────────────────────────
            case "COL", "STACK" -> vbox(id, children);
            case "ROW" -> {
                HBox hb = new HBox(6);
                hb.setId(id); hb.getStyleClass().add("gs-row");
                hb.getChildren().addAll(children);
                yield hb;
            }
            case "GRID", "UNIFORMGRID" -> {
                int cols = staticInt(node, "COLS", 3);
                GridPane gp = new GridPane();
                gp.setId(id); gp.getStyleClass().add("gs-grid");
                gp.setHgap(8); gp.setVgap(8);
                for (int i = 0; i < children.size(); i++)
                    gp.add(children.get(i), i % cols, i / cols);
                yield gp;
            }
            case "PANEL" -> {
                TitledPane tp = new TitledPane(label, vbox(id + "_inner", children));
                tp.setId(id); tp.setCollapsible(false);
                tp.getStyleClass().add("gs-panel");
                yield tp;
            }
            case "SCROLL" -> {
                VBox inner = vbox(id + "_inner", children);
                ScrollPane sp = new ScrollPane(inner);
                sp.setId(id); sp.setFitToWidth(true);
                sp.getStyleClass().add("gs-scroll");
                yield sp;
            }
            // ── Text ──────────────────────────────────────────────────────
            case "LABEL" -> {
                String text = staticStr(node, "TEXT").or(() -> staticStr(node, "LABEL")).orElse("");
                Label lbl = new Label(text.isEmpty()
                    ? ExpressionEvaluator.toStr(eval.evaluate(
                        node.prop("TEXT").or(() -> node.prop("LABEL"))
                            .map(Property::value).orElse(new LiteralExpr("")))) : text);
                lbl.setId(id); lbl.getStyleClass().add("gs-label");
                lbl.setWrapText(true);
                yield lbl;
            }
            // ── Interactive ───────────────────────────────────────────────
            case "BUTTON" -> {
                Button btn = new Button(label.isEmpty() ? "Button" : label);
                btn.setId(id); btn.getStyleClass().add("gs-button");
                btn.setOnAction(e -> handleEvent(id, "CLICK", null));
                yield btn;
            }
            case "INPUT" -> {
                String hint = staticStr(node, "HINT").orElse("");
                TextField tf = new TextField();
                tf.setId(id); tf.setPromptText(hint);
                tf.getStyleClass().add("gs-input");
                tf.textProperty().addListener((obs, o, v) -> { if (!updating.contains(id)) handleEvent(id, "CHANGE", v); });
                yield tf;
            }
            case "CHECK" -> {
                CheckBox cb = new CheckBox(label);
                cb.setId(id); cb.getStyleClass().add("gs-check");
                cb.selectedProperty().addListener((obs, o, v) -> { if (!updating.contains(id)) handleEvent(id, "CHANGE", v); });
                yield cb;
            }
            case "TOGGLE" -> {
                ToggleButton tb = new ToggleButton(label.isEmpty() ? "Off" : label);
                tb.setId(id); tb.getStyleClass().add("gs-toggle");
                tb.selectedProperty().addListener((obs, o, v) -> { if (!updating.contains(id)) handleEvent(id, "CHANGE", v); });
                yield tb;
            }
            case "PROGRESS" -> {
                double max = staticDouble(node, "MAX", 100.0);
                progressMax.put(id, max);
                ProgressBar pb = new ProgressBar(0);
                pb.setId(id); pb.getStyleClass().add("gs-progress");
                pb.setMaxWidth(Double.MAX_VALUE);
                yield pb;
            }
            case "SLIDER" -> {
                double min = staticDouble(node, "MIN", 0.0);
                double max = staticDouble(node, "MAX", 100.0);
                double val = staticDouble(node, "VALUE", min);
                Slider sl = new Slider(min, max, val);
                sl.setId(id); sl.getStyleClass().add("gs-slider");
                sl.setShowTickLabels(false); sl.setMajorTickUnit(max - min);
                sl.valueProperty().addListener((obs, o, v) -> { if (!updating.contains(id)) handleEvent(id, "CHANGE", v.doubleValue()); });
                yield sl;
            }
            case "SEPARATOR", "RULE" -> {
                Separator sep = new Separator();
                sep.setId(id); sep.getStyleClass().add("gs-rule");
                yield sep;
            }
            case "GAUGE" -> {
                double max  = staticDouble(node, "MAX", 100.0);
                String lbl2 = staticStr(node, "GAUGELABEL").or(() -> staticStr(node, "LABEL")).orElse("");
                String col  = staticStr(node, "STROKE").or(() -> staticStr(node, "COLOR")).orElse("bright_blue");
                GaugeWidget gw = new GaugeWidget();
                gw.setId(id); gw.setMax(max); gw.setLabel(lbl2); gw.setFillColor(col);
                gw.setWidth(200); gw.setHeight(64);
                yield gw;
            }
            case "TEXTAREA" -> {
                TextArea ta = new TextArea();
                ta.setId(id); ta.getStyleClass().add("gs-textarea");
                ta.textProperty().addListener((obs, o, v) -> { if (!updating.contains(id)) handleEvent(id, "CHANGE", v); });
                yield ta;
            }
            default -> {
                VBox fb = vbox(id, children);
                fb.getStyleClass().add("gs-unknown");
                yield fb;
            }
        };
    }

    // ── TABS ──────────────────────────────────────────────────────────────────

    private TabPane buildTabs(ElementDecl node, List<String> childIds) {
        TabPane tp = new TabPane();
        tp.setId(node.id()); tp.getStyleClass().add("gs-tabs");
        tp.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);

        for (String tabId : childIds) {
            ElementDecl tabNode = nodeMap.get(tabId);
            if (tabNode == null || !"TAB".equals(tabNode.noun())) continue;
            String tabLabel = staticStr(tabNode, "LABEL").orElse(tabId);

            List<String> tabChildIds = childrenMap.getOrDefault(tabId, List.of());
            Node content = tabChildIds.isEmpty() ? new VBox()
                    : tabChildIds.size() == 1 ? buildNode(tabChildIds.get(0))
                    : vbox(tabId + "_content", buildChildren(tabChildIds));

            Tab tab = new Tab(tabLabel, content);
            tab.setId(tabId);
            tp.getTabs().add(tab);
            if (content != null) widgetMap.put(tabId, content);
        }

        widgetMap.put(node.id(), tp);
        return tp;
    }

    // ── LIST ──────────────────────────────────────────────────────────────────

    private ListView<String> buildList(ElementDecl node, List<String> childIds) {
        Map<String, String> itemLabels = new LinkedHashMap<>();
        for (String cid : childIds) {
            ElementDecl itemNode = nodeMap.get(cid);
            if (itemNode == null) continue;
            itemLabels.put(cid, staticStr(itemNode, "LABEL").orElse(cid));
        }

        ObservableList<String> ids = FXCollections.observableArrayList(itemLabels.keySet());
        ListView<String> lv = new ListView<>(ids);
        lv.setId(node.id()); lv.getStyleClass().add("gs-list");
        lv.setCellFactory(v -> new ListCell<>() {
            @Override protected void updateItem(String id, boolean empty) {
                super.updateItem(id, empty);
                setText(empty || id == null ? "" : itemLabels.getOrDefault(id, id));
            }
        });

        double h = staticDouble(node, "HEIGHT", 0);
        if (h > 0) { lv.setPrefHeight(h * 24); lv.setMaxHeight(h * 24); }

        lv.getSelectionModel().selectedItemProperty().addListener((obs, o, sel) -> {
            if (sel != null && !updating.contains(node.id()))
                handleEvent(node.id(), "CHANGE", sel);
        });

        widgetMap.put(node.id(), lv);
        return lv;
    }

    // ── Static prop helpers ───────────────────────────────────────────────────

    private Optional<String> staticStr(ElementDecl node, String key) {
        return node.prop(key)
            .filter(p -> LiveBinding.collectRefs(p.value()).isEmpty())
            .map(p -> ExpressionEvaluator.toStr(eval.evaluate(p.value())));
    }

    private double staticDouble(ElementDecl node, String key, double def) {
        return node.prop(key)
            .filter(p -> LiveBinding.collectRefs(p.value()).isEmpty())
            .map(p -> ExpressionEvaluator.toDouble(eval.evaluate(p.value())))
            .orElse(def);
    }

    private int staticInt(ElementDecl node, String key, int def) {
        return (int) staticDouble(node, key, def);
    }

    // ── Apply static props ────────────────────────────────────────────────────

    private static final Set<String> SKIP = Set.of(
        "IN","LABEL","TEXT","HINT","MIN","MAX","GAUGELABEL","STROKE","COLS","ROWS","VALUE"
    );

    private void applyStaticProps(Node w, ElementDecl node) {
        for (Property p : node.props()) {
            if (SKIP.contains(p.key())) continue;
            if (!LiveBinding.collectRefs(p.value()).isEmpty()) continue;
            applyProp(w, node.id(), p.key(), eval.evaluate(p.value()));
        }
        // Apply VALUE after all other props
        node.prop("VALUE").filter(p -> LiveBinding.collectRefs(p.value()).isEmpty())
            .ifPresent(p -> setWidgetValue(node.id(), w, eval.evaluate(p.value())));
    }

    private void applyProp(Node w, String id, String key, Object val) {
        switch (key) {
            case "ENABLED" -> w.setDisable(!ExpressionEvaluator.toBool(val));
            case "VISIBLE" -> w.setVisible(ExpressionEvaluator.toBool(val));
            case "HEIGHT"  -> { if (w instanceof Region r) { r.setPrefHeight(ExpressionEvaluator.toDouble(val)); r.setMaxHeight(ExpressionEvaluator.toDouble(val)); } }
            case "WIDTH"   -> { if (w instanceof Region r) { r.setPrefWidth(ExpressionEvaluator.toDouble(val));  r.setMaxWidth(ExpressionEvaluator.toDouble(val)); } }
            case "MARGIN"  -> { if (w instanceof Region r) { double m = ExpressionEvaluator.toDouble(val); VBox.setMargin(r, new Insets(m)); } }
            case "STYLE"   -> {
                String[] classes = ExpressionEvaluator.toStr(val).split("\\s+");
                for (String cls : classes) {
                    String mapped = switch (cls) { case "h1" -> "gs-h1"; case "h2" -> "gs-h2"; case "muted" -> "gs-muted"; default -> cls; };
                    if (!w.getStyleClass().contains(mapped)) w.getStyleClass().add(mapped);
                }
            }
        }
    }

    private void setWidgetValue(String id, Node w, Object val) {
        switch (w) {
            case Slider sl         -> sl.setValue(ExpressionEvaluator.toDouble(val));
            case ProgressBar pb    -> pb.setProgress(ExpressionEvaluator.toDouble(val) / progressMax.getOrDefault(id, 100.0));
            case CheckBox cb       -> cb.setSelected(ExpressionEvaluator.toBool(val));
            case ToggleButton tb   -> tb.setSelected(ExpressionEvaluator.toBool(val));
            case TextField tf      -> tf.setText(ExpressionEvaluator.toStr(val));
            case TextArea ta       -> ta.setText(ExpressionEvaluator.toStr(val));
            case GaugeWidget gw    -> gw.setValue(ExpressionEvaluator.toDouble(val));
            default                -> {}
        }
    }

    // ── Live bindings ─────────────────────────────────────────────────────────

    public void wireBindings(Stage s) {
        this.stage = s;
        nodeMap.forEach((nodeId, node) ->
            node.props().forEach(p -> {
                List<String> refs = LiveBinding.collectRefs(p.value());
                if (refs.isEmpty()) return;
                bindProp(nodeId, p.key(), p.value(), refs);
            })
        );
    }

    private void bindProp(String nodeId, String key, ValueExpr expr, List<String> refs) {
        Runnable apply = () -> {
            Object val = eval.evaluate(expr);

            if (nodeId.equals(windowId)) {
                if ("TITLE".equals(key) && stage != null)
                    runOnFx(() -> stage.setTitle(ExpressionEvaluator.toStr(val)));
                return;
            }

            Node w = widgetMap.get(nodeId);
            if (w == null) return;
            runOnFx(() -> applyLiveProp(w, nodeId, key, val));
        };

        for (String ref : refs) store.subscribe(ref, v -> apply.run());
        apply.run(); // prime immediately
    }

    private void applyLiveProp(Node w, String id, String key, Object val) {
        switch (key) {
            case "TEXT", "LABEL" -> {
                if (w instanceof Label lbl)   lbl.setText(ExpressionEvaluator.toStr(val));
                if (w instanceof Button btn)  btn.setText(ExpressionEvaluator.toStr(val));
            }
            case "VALUE" -> {
                updating.add(id);
                try { setWidgetValue(id, w, val); } finally { updating.remove(id); }
            }
            case "ENABLED" -> w.setDisable(!ExpressionEvaluator.toBool(val));
            case "VISIBLE" -> w.setVisible(ExpressionEvaluator.toBool(val));
            case "TITLE"   -> { if (stage != null) stage.setTitle(ExpressionEvaluator.toStr(val)); }
        }
    }

    // ── Event dispatch ────────────────────────────────────────────────────────

    public void handleEvent(String widgetId, String event, Object value) {
        if (!ready || updating.contains(widgetId)) return;
        List<Behavior> bs = behaviorsMap.getOrDefault(widgetId, List.of());
        for (Behavior b : bs) if (b.event().equals(event)) dispatchBehavior(b, value);
    }

    private void dispatchBehavior(Behavior b, Object elementValue) {
        if ("__noop__".equals(b.targetVar())) return;

        Object val;
        if (!b.expression().isEmpty()) {
            List<String> refs = LiveBinding.collectRefs(SyntaxParser.parseValueExpr(b.expression()));
            val = (!refs.isEmpty() && elementValue != null && refs.stream().allMatch(nodeMap::containsKey))
                    ? elementValue
                    : eval.evaluateString(b.expression());
        } else {
            val = elementValue != null ? elementValue : "";
        }

        String key = ExpressionEvaluator.toStr(val).toUpperCase();
        Runnable action = actions.get(key);
        if (action != null) { action.run(); return; }
        store.set(b.targetVar(), val);
    }

    // ── Built-in actions ─────────────────────────────────────────────────────

    private void registerBuiltinActions() {
        actions.put("MSG_INFO",    () -> { showAlert(Alert.AlertType.INFORMATION, "Info");    store.set("DIALOG_MSG_RESULT", "OK"); });
        actions.put("MSG_WARN",    () -> { showAlert(Alert.AlertType.WARNING,     "Warning"); store.set("DIALOG_MSG_RESULT", "OK"); });
        actions.put("MSG_ERROR",   () -> { showAlert(Alert.AlertType.ERROR,       "Error");   store.set("DIALOG_MSG_RESULT", "OK"); });
        actions.put("MSG_CONFIRM", () -> { showAlert(Alert.AlertType.CONFIRMATION,"Confirm"); store.set("DIALOG_MSG_RESULT", "True"); });
        actions.put("ASYNC_START", () -> startAsyncTask());
        actions.put("CLIP_COPY",   () -> {
            String text = ExpressionEvaluator.toStr(store.get("CLIP_TEXT", ""));
            javafx.scene.input.Clipboard.getSystemClipboard()
                .setContent(new javafx.scene.input.ClipboardContent() {{ putString(text); }});
        });
    }

    private void showAlert(Alert.AlertType type, String title) {
        String msg = ExpressionEvaluator.toStr(store.get("DIALOG_MSG", title));
        runOnFx(() -> { Alert a = new Alert(type, msg); a.setTitle(title); a.showAndWait(); });
    }

    private void startAsyncTask() {
        Thread.ofVirtual().start(() -> {
            store.set("ASYNC_STATUS", "Running");
            for (int i = 0; i <= 100; i += 5) {
                final int p = i;
                Platform.runLater(() -> store.set("ASYNC_PROGRESS", p));
                try { Thread.sleep(100); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
            }
            Platform.runLater(() -> { store.set("ASYNC_STATUS", "Done"); store.set("ASYNC_PROGRESS", 100); });
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static VBox vbox(String id, List<Node> children) {
        VBox vb = new VBox(4);
        vb.setId(id);
        vb.getChildren().addAll(children);
        return vb;
    }

    private static void runOnFx(Runnable r) {
        if (Platform.isFxApplicationThread()) r.run(); else Platform.runLater(r);
    }
}
