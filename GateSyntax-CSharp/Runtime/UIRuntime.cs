using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Ink;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Media3D;
using System.Windows.Shapes;

namespace GateSyntax.Runtime;

public sealed class UIRuntime
{
    private readonly List<SyntaxNode> _nodes;
    private readonly StateStore _store;
    private readonly ExpressionEvaluator _eval;
    private readonly LiveBinding _live;
    private readonly Dictionary<string, FrameworkElement> _elements = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Action> _actions = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<FrameworkElement, int> _gridChildCount = new();
    private Window? _root;

    public UIRuntime(List<SyntaxNode> nodes, StateStore store)
    {
        _nodes = nodes;
        _store = store;
        _eval = new ExpressionEvaluator(store);
        _live = new LiveBinding(store);
        RegisterBuiltinActions();
    }

    public void RegisterAction(string name, Action action) => _actions[name] = action;

    public Window Build()
    {
        foreach (var n in _nodes.OfType<ElementDecl>())
            CreateElement(n);

        foreach (var n in _nodes.OfType<ElementDecl>())
            ApplyElement(n);

        PostProcess();

        return _root ?? throw new InvalidOperationException("No WINDOW declared");
    }

    // Post-process special nodes that need access to built tree
    private void PostProcess()
    {
        foreach (var n in _nodes.OfType<ElementDecl>())
        {
            if (!_elements.TryGetValue(n.Id, out var el)) continue;
            switch (n.Noun)
            {
                case "VIEWPORT3D":
                    BuildViewport3D((Viewport3D)el);
                    break;
                case "FLOWDOCREADER":
                    BuildFlowDoc((FlowDocumentReader)el);
                    break;
                case "RICHTEXTBOX":
                    BuildRichTextBox((RichTextBox)el);
                    break;
                case "CANVAS" when n.Id == "PulseCanvas":
                    BuildPulseAnimation(el);
                    break;
                case "CANVAS" when n.Id == "ColorBox":
                    break;
                case "CANVAS" when n.Id == "SpinCanvas":
                    BuildSpinAnimation(el);
                    break;
                case "CANVAS" when n.Id == "KfCanvas":
                    BuildKeyframeAnimation(el);
                    break;
                case "PANEL" when n.Id == "ColorBox":
                    BuildColorAnimation(el);
                    break;
                case "INKCANVAS":
                    WireInkCanvas((InkCanvas)el);
                    break;
                case "LIST" when n.Id == "SourceDragList":
                    WireDragSource((ListBox)el);
                    break;
                case "LIST" when n.Id == "TargetDragList":
                    WireDragTarget((ListBox)el);
                    break;
            }
        }
    }

    private void WireInkCanvas(InkCanvas ink)
    {
        // Wire InkPenBtn, InkEraseBtn, InkClearBtn
        if (_elements.TryGetValue("InkPenBtn", out var penEl) && penEl is Button penBtn)
        {
            penBtn.Click -= penBtn_PenClick;
            penBtn.Tag = ink;
            penBtn.Click += penBtn_PenClick;
        }
        if (_elements.TryGetValue("InkEraseBtn", out var eraseEl) && eraseEl is Button eraseBtn)
        {
            eraseBtn.Tag = ink;
            eraseBtn.Click += (_, _) => ink.EditingMode = InkCanvasEditingMode.EraseByStroke;
        }
        if (_elements.TryGetValue("InkClearBtn", out var clearEl) && clearEl is Button clearBtn)
        {
            clearBtn.Tag = ink;
            clearBtn.Click += (_, _) => ink.Strokes = new StrokeCollection();
        }
    }
    private static void penBtn_PenClick(object s, RoutedEventArgs e)
    {
        if (s is Button b && b.Tag is InkCanvas ic) ic.EditingMode = InkCanvasEditingMode.Ink;
    }

    private static void WireDragSource(ListBox src)
    {
        Point dragStart = default;
        src.PreviewMouseLeftButtonDown += (_, e) => dragStart = e.GetPosition(null);
        src.MouseMove += (_, e) =>
        {
            if (e.LeftButton != MouseButtonState.Pressed) return;
            var diff = dragStart - e.GetPosition(null);
            if (Math.Abs(diff.X) < SystemParameters.MinimumHorizontalDragDistance &&
                Math.Abs(diff.Y) < SystemParameters.MinimumVerticalDragDistance) return;
            if (src.SelectedItem is ListBoxItem item)
                DragDrop.DoDragDrop(src, item.Content?.ToString() ?? "", DragDropEffects.Move);
        };
    }

    private static void WireDragTarget(ListBox tgt)
    {
        tgt.AllowDrop = true;
        tgt.Drop += (_, e) =>
        {
            if (e.Data.GetData(DataFormats.StringFormat) is string s)
                tgt.Items.Add(new ListBoxItem { Content = s });
        };
    }

    private void CreateElement(ElementDecl n)
    {
        FrameworkElement el = n.Noun switch
        {
            "WINDOW" => CreateWindow(n),
            "ROW" => new StackPanel { Orientation = Orientation.Horizontal },
            "COL" or "STACK" => new StackPanel { Orientation = Orientation.Vertical },
            "GRID" => CreateGrid(n),
            "DOCKPANEL" => new DockPanel { LastChildFill = true },
            "PANEL" => new Border(),
            "BUTTON" => new Button(),
            "LABEL" => new TextBlock { TextWrapping = TextWrapping.Wrap },
            "INPUT" => new TextBox { Padding = new Thickness(4) },
            "SLIDER" => new Slider(),
            "TOGGLE" => new ToggleButton(),
            "CHECK" => new CheckBox(),
            "LIST" => new ListBox(),
            "ITEM" => new ListBoxItem(),
            "IMAGE" => new Image(),
            "GAUGE" => CreateGauge(),
            "CANVAS" => new Canvas(),
            "TABS" => new TabControl { TabStripPlacement = Dock.Left },
            "TAB" => new TabItem(),
            "PROGRESS" => new ProgressBar(),
            "SCROLL" => new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto },
            "MENU" => new Menu(),
            "MENUITEM" => new MenuItem(),
            "SEPARATOR" => new Separator(),
            "STATUSBAR" => new StatusBar(),
            "STATUSITEM" => new StatusBarItem(),
            "INKCANVAS" => new InkCanvas(),
            "VIEWPORT3D" => new Viewport3D { MinHeight = 400 },
            "RICHTEXTBOX" => new RichTextBox(),
            "PASSWORDBOX" => new PasswordBox(),
            "COMBOBOX" => new ComboBox(),
            "COMBOITEM" => new ComboBoxItem(),
            "DATAGRID" => new DataGrid(),
            "TREEVIEW" => new TreeView(),
            "TREEITEM" => new TreeViewItem(),
            "GROUPBOX" => new GroupBox(),
            "EXPANDER" => new Expander(),
            "TOOLBAR" => new ToolBar(),
            "UNIFORMGRID" => new UniformGrid(),
            "WRAPANEL" or "WRAP" => new WrapPanel(),
            "VIEWBOX" => new Viewbox(),
            "RECT" or "RECTANGLE" => new Rectangle(),
            "ELLIPSE" => new Ellipse(),
            "LINE" => new Line(),
            "PATH" => new System.Windows.Shapes.Path(),
            "POLYGON" => new Polygon(),
            "POLYLINE" => new Polyline(),
            "FLOWDOCREADER" => new FlowDocumentReader(),
            "CALENDAR" => new Calendar(),
            "DATEPICKER" => new DatePicker(),
            "REPEATBUTTON" => new RepeatButton(),
            _ => new Border()
        };

        _elements[n.Id] = el;
    }

    private Window CreateWindow(ElementDecl n)
    {
        var w = new Window
        {
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
            FontFamily = new FontFamily("Segoe UI"),
            FontSize = 13
        };
        foreach (var p in n.Props)
        {
            if (p.Value is BinaryExpr(var le, "X", var re))
            {
                w.Width = ExpressionEvaluator.ToDouble(_eval.Evaluate(le));
                w.Height = ExpressionEvaluator.ToDouble(_eval.Evaluate(re));
            }
        }
        _root = w;
        return w;
    }

    private static FrameworkElement CreateGrid(ElementDecl n)
    {
        var g = new Grid();
        int cols = 1, rows = 1;
        foreach (var p in n.Props)
        {
            if (p.Key == "COLS" && p.Value is LiteralExpr(var cv))
                cols = (int)ExpressionEvaluator.ToDouble(cv);
            if (p.Key == "ROWS" && p.Value is LiteralExpr(var rv))
                rows = (int)ExpressionEvaluator.ToDouble(rv);
            // Handle NxM form (COLS X ROWS encoded as binary)
            if (p.Value is BinaryExpr(var bl, "X", var br))
            {
                cols = (int)ExpressionEvaluator.ToDouble(new ExpressionEvaluator(new StateStore()).Evaluate(bl));
                rows = (int)ExpressionEvaluator.ToDouble(new ExpressionEvaluator(new StateStore()).Evaluate(br));
            }
        }
        for (int c = 0; c < cols; c++) g.ColumnDefinitions.Add(new ColumnDefinition());
        for (int r = 0; r < rows; r++) g.RowDefinitions.Add(new RowDefinition());
        return g;
    }

    private static FrameworkElement CreateGauge() => new GaugeControl();

    private void ApplyElement(ElementDecl n)
    {
        if (!_elements.TryGetValue(n.Id, out var el)) return;
        ApplyProperties(el, n);
        ApplyBehaviors(el, n);
        ApplyContainment(el, n);
    }

    private void ApplyProperties(FrameworkElement el, ElementDecl n)
    {
        if (el is Window win)
        {
            foreach (var p in n.Props)
            {
                if (p.Key == "TITLE")
                {
                    if (LiveBinding.CollectRefs(p.Value).Count > 0)
                        _live.Bind(p.Value, v => win.Title = ExpressionEvaluator.ToString2(v));
                    else
                        win.Title = ExpressionEvaluator.ToString2(_eval.Evaluate(p.Value));
                }
            }
            return;
        }

        foreach (var p in n.Props)
        {
            var val = _eval.Evaluate(p.Value);
            bool hasRef = LiveBinding.CollectRefs(p.Value).Count > 0;

            switch (p.Key)
            {
                case "IN": break;
                case "DOCK":
                    var dockStr = ExpressionEvaluator.ToString2(val).ToLowerInvariant();
                    Dock dock = dockStr switch
                    {
                        "top" => Dock.Top,
                        "bottom" => Dock.Bottom,
                        "left" => Dock.Left,
                        "right" => Dock.Right,
                        _ => Dock.Top
                    };
                    DockPanel.SetDock(el, dock);
                    break;

                case "LABEL":
                    SetLabel(el, p.Value, val, hasRef);
                    break;

                case "TEXT":
                    if (el is TextBlock tbl)
                    {
                        if (hasRef) _live.Bind(p.Value, v => tbl.Text = ExpressionEvaluator.ToString2(v));
                        else tbl.Text = ExpressionEvaluator.ToString2(val);
                    }
                    else if (el is TextBox txb)
                    {
                        if (hasRef) _live.Bind(p.Value, v => txb.Text = ExpressionEvaluator.ToString2(v));
                        else txb.Text = ExpressionEvaluator.ToString2(val);
                    }
                    break;

                case "HINT":
                    if (el is TextBox hintBox) SetPlaceholder(hintBox, ExpressionEvaluator.ToString2(val));
                    break;

                case "VALUE":
                    ApplyValue(el, p.Value, val, hasRef);
                    break;

                case "MIN":
                    if (el is Slider slMin) slMin.Minimum = ExpressionEvaluator.ToDouble(val);
                    else if (el is ProgressBar pbMin) pbMin.Minimum = ExpressionEvaluator.ToDouble(val);
                    break;

                case "MAX":
                    if (el is Slider slMax) slMax.Maximum = ExpressionEvaluator.ToDouble(val);
                    else if (el is ProgressBar pbMax) pbMax.Maximum = ExpressionEvaluator.ToDouble(val);
                    else if (el is GaugeControl gcMax) gcMax.GaugeMaximum = ExpressionEvaluator.ToDouble(val);
                    break;

                case "WIDTH":
                    el.Width = ExpressionEvaluator.ToDouble(val);
                    break;

                case "HEIGHT":
                    el.Height = ExpressionEvaluator.ToDouble(val);
                    break;

                case "BG":
                    var bgBrush = ParseBrush(ExpressionEvaluator.ToString2(val));
                    switch (el)
                    {
                        case Border bd: bd.Background = bgBrush; break;
                        case Panel pn: pn.Background = bgBrush; break;
                        case Control ctrl: ctrl.Background = bgBrush; break;
                        case TextBlock tblBg: tblBg.Background = bgBrush; break;
                    }
                    break;

                case "COLOR" or "FG":
                    var fgBrush = ParseBrush(ExpressionEvaluator.ToString2(val));
                    if (el is TextBlock tblFg) tblFg.Foreground = fgBrush;
                    else if (el is Control ctrlFg) ctrlFg.Foreground = fgBrush;
                    break;

                case "STROKE":
                    if (el is GaugeControl gcStroke)
                        gcStroke.GaugeStroke = ParseBrush(ExpressionEvaluator.ToString2(val));
                    else if (el is Shape shapeStroke)
                        shapeStroke.Stroke = ParseBrush(ExpressionEvaluator.ToString2(val));
                    break;

                case "FILL":
                    if (el is Shape shapeFill)
                        shapeFill.Fill = ParseBrush(ExpressionEvaluator.ToString2(val));
                    else if (el is Border borderFill)
                        borderFill.Background = ParseBrush(ExpressionEvaluator.ToString2(val));
                    break;

                case "SIZE":
                    double sz = ExpressionEvaluator.ToDouble(val);
                    if (el is Control ctrlSz) ctrlSz.FontSize = sz;
                    else if (el is TextBlock tblSz) tblSz.FontSize = sz;
                    break;

                case "WEIGHT":
                    FontWeight fw = ExpressionEvaluator.ToString2(val).ToLowerInvariant() switch
                    {
                        "bold" => FontWeights.Bold,
                        "semibold" => FontWeights.SemiBold,
                        "thin" => FontWeights.Thin,
                        _ => FontWeights.Normal
                    };
                    if (el is TextBlock tblW) tblW.FontWeight = fw;
                    else if (el is Control ctrlW) ctrlW.FontWeight = fw;
                    break;

                case "MARGIN":
                    el.Margin = ParseThickness(ExpressionEvaluator.ToString2(val));
                    break;

                case "PADDING":
                    if (el is Control ctrlPad) ctrlPad.Padding = ParseThickness(ExpressionEvaluator.ToString2(val));
                    else if (el is Border bdPad) bdPad.Padding = ParseThickness(ExpressionEvaluator.ToString2(val));
                    break;

                case "VISIBLE":
                    if (hasRef) _live.Bind(p.Value, v =>
                        el.Visibility = ExpressionEvaluator.ToBool(v) ? Visibility.Visible : Visibility.Collapsed);
                    else
                        el.Visibility = ExpressionEvaluator.ToBool(val) ? Visibility.Visible : Visibility.Collapsed;
                    break;

                case "ENABLED":
                    if (hasRef) _live.Bind(p.Value, v => el.IsEnabled = ExpressionEvaluator.ToBool(v));
                    else el.IsEnabled = ExpressionEvaluator.ToBool(val);
                    break;

                case "STYLE":
                    var styleKey = ExpressionEvaluator.ToString2(val);
                    if (Application.Current.Resources.Contains(styleKey))
                        el.Style = (Style)Application.Current.Resources[styleKey];
                    break;

                case "GAGELABEL" or "GAUGELABEL":
                    if (el is GaugeControl gcLbl) gcLbl.GaugeLabel = ExpressionEvaluator.ToString2(val);
                    break;

                case "COLS":
                    if (el is UniformGrid ug) ug.Columns = (int)ExpressionEvaluator.ToDouble(val);
                    else if (el is Grid g2)
                    {
                        int c = (int)ExpressionEvaluator.ToDouble(val);
                        while (g2.ColumnDefinitions.Count < c)
                            g2.ColumnDefinitions.Add(new ColumnDefinition());
                    }
                    break;

                case "ROWS":
                    if (el is UniformGrid ugr) ugr.Rows = (int)ExpressionEvaluator.ToDouble(val);
                    else if (el is Grid gr)
                    {
                        int r = (int)ExpressionEvaluator.ToDouble(val);
                        while (gr.RowDefinitions.Count < r)
                            gr.RowDefinitions.Add(new RowDefinition());
                    }
                    break;

                case "WRAP":
                    if (el is TextBlock tblWrap)
                        tblWrap.TextWrapping = ExpressionEvaluator.ToBool(val) ? TextWrapping.Wrap : TextWrapping.NoWrap;
                    break;

                case "MULTILINE":
                    if (el is TextBox mlBox && ExpressionEvaluator.ToBool(val))
                    {
                        mlBox.AcceptsReturn = true;
                        mlBox.TextWrapping = TextWrapping.Wrap;
                    }
                    break;

                case "READONLY":
                    if (el is TextBox roBox) roBox.IsReadOnly = ExpressionEvaluator.ToBool(val);
                    break;

                case "CORNERRADIUS":
                    if (el is Border brCr) brCr.CornerRadius = new CornerRadius(ExpressionEvaluator.ToDouble(val));
                    break;

                case "INDETERMINATE":
                    if (el is ProgressBar pbInd) pbInd.IsIndeterminate = ExpressionEvaluator.ToBool(val);
                    break;

                case "COLSPAN" or "GCOLSPAN":
                    Grid.SetColumnSpan(el, (int)ExpressionEvaluator.ToDouble(val)); break;
                case "ROWSPAN" or "GROWSPAN":
                    Grid.SetRowSpan(el, (int)ExpressionEvaluator.ToDouble(val)); break;
                case "GCOL" or "GRIDCOL":
                    Grid.SetColumn(el, (int)ExpressionEvaluator.ToDouble(val)); break;
                case "GROW" or "GRIDROW":
                    Grid.SetRow(el, (int)ExpressionEvaluator.ToDouble(val)); break;
            }
        }
    }

    private void SetLabel(FrameworkElement el, ValueExpr expr, object val, bool hasRef)
    {
        string text = ExpressionEvaluator.ToString2(val);
        switch (el)
        {
            case RepeatButton rrb:
                if (hasRef) _live.Bind(expr, v => rrb.Content = ExpressionEvaluator.ToString2(v)); else rrb.Content = text; break;
            case CheckBox cb:
                if (hasRef) _live.Bind(expr, v => cb.Content = ExpressionEvaluator.ToString2(v)); else cb.Content = text; break;
            case ToggleButton tb:
                if (hasRef) _live.Bind(expr, v => tb.Content = ExpressionEvaluator.ToString2(v)); else tb.Content = text; break;
            case Button b:
                if (hasRef) _live.Bind(expr, v => b.Content = ExpressionEvaluator.ToString2(v)); else b.Content = text; break;
            case GroupBox gb:
                if (hasRef) _live.Bind(expr, v => gb.Header = ExpressionEvaluator.ToString2(v)); else gb.Header = text; break;
            case TabItem ti:
                if (hasRef) _live.Bind(expr, v => ti.Header = ExpressionEvaluator.ToString2(v)); else ti.Header = text; break;
            case MenuItem mi:
                if (hasRef) _live.Bind(expr, v => mi.Header = ExpressionEvaluator.ToString2(v)); else mi.Header = text; break;
            case TreeViewItem tvi:
                if (hasRef) _live.Bind(expr, v => tvi.Header = ExpressionEvaluator.ToString2(v)); else tvi.Header = text; break;
            case Expander exp:
                if (hasRef) _live.Bind(expr, v => exp.Header = ExpressionEvaluator.ToString2(v)); else exp.Header = text; break;
            case ComboBoxItem cbi:
                if (hasRef) _live.Bind(expr, v => cbi.Content = ExpressionEvaluator.ToString2(v)); else cbi.Content = text; break;
            case ListBoxItem lbi:
                if (hasRef) _live.Bind(expr, v => lbi.Content = ExpressionEvaluator.ToString2(v)); else lbi.Content = text; break;
            case TextBlock tbl:
                if (hasRef) _live.Bind(expr, v => tbl.Text = ExpressionEvaluator.ToString2(v)); else tbl.Text = text; break;
        }
    }

    private void ApplyValue(FrameworkElement el, ValueExpr expr, object val, bool hasRef)
    {
        switch (el)
        {
            case Slider sl:
                if (hasRef) _live.Bind(expr, v => sl.Value = ExpressionEvaluator.ToDouble(v));
                else sl.Value = ExpressionEvaluator.ToDouble(val);
                break;
            case ProgressBar pb:
                if (hasRef) _live.Bind(expr, v => pb.Value = ExpressionEvaluator.ToDouble(v));
                else pb.Value = ExpressionEvaluator.ToDouble(val);
                break;
            case CheckBox cbv:
                if (hasRef) _live.Bind(expr, v => cbv.IsChecked = ExpressionEvaluator.ToBool(v));
                else cbv.IsChecked = ExpressionEvaluator.ToBool(val);
                break;
            case ToggleButton tbv:
                if (hasRef) _live.Bind(expr, v => tbv.IsChecked = ExpressionEvaluator.ToBool(v));
                else tbv.IsChecked = ExpressionEvaluator.ToBool(val);
                break;
            case GaugeControl gc:
                if (hasRef) _live.Bind(expr, v => gc.GaugeValue = ExpressionEvaluator.ToDouble(v));
                else gc.GaugeValue = ExpressionEvaluator.ToDouble(val);
                break;
        }
    }

    private void ApplyBehaviors(FrameworkElement el, ElementDecl n)
    {
        foreach (var b in n.Behaviors)
        {
            switch (b.Event.ToUpperInvariant())
            {
                case "CLICK":
                    if (el is Button btn) btn.Click += (_, _) => HandleBehavior(b, el);
                    else if (el is ToggleButton tb) tb.Click += (_, _) => HandleBehavior(b, el);
                    else if (el is RepeatButton rb) rb.Click += (_, _) => HandleBehavior(b, el);
                    break;

                case "CHANGE":
                    if (el is Slider sl) sl.ValueChanged += (_, _) => HandleBehaviorFromElement(b, el);
                    else if (el is TextBox tx) tx.TextChanged += (_, _) => HandleBehaviorFromElement(b, el);
                    else if (el is CheckBox cb)
                    {
                        cb.Checked += (_, _) => HandleBehaviorFromElement(b, el);
                        cb.Unchecked += (_, _) => HandleBehaviorFromElement(b, el);
                    }
                    else if (el is ToggleButton tbt)
                    {
                        tbt.Checked += (_, _) => HandleBehaviorFromElement(b, el);
                        tbt.Unchecked += (_, _) => HandleBehaviorFromElement(b, el);
                    }
                    break;

                case "LOAD":
                    el.Loaded += (_, _) => HandleBehavior(b, el);
                    break;

                case "HOVER":
                    el.MouseEnter += (_, _) => HandleBehavior(b, el);
                    break;
            }
        }
    }

    private void HandleBehavior(Behavior b, FrameworkElement el)
    {
        if (b.TargetVar == "__noop__") return;
        var val = _eval.EvaluateString(b.Expression);
        var valStr = ExpressionEvaluator.ToString2(val);
        // If evaluated value is a registered action name, call action (action manages state)
        if (_actions.TryGetValue(valStr, out var action)) { action(); return; }
        _store.Set(b.TargetVar, val);
    }

    private void HandleBehaviorFromElement(Behavior b, FrameworkElement el)
    {
        if (b.TargetVar == "__noop__") return;
        if (!string.IsNullOrWhiteSpace(b.Expression))
        {
            // Expression may reference element by ID: [SliderName] → use stored element value
            var refs = LiveBinding.CollectRefs(SyntaxParser.ParseValueExpr(b.Expression));
            // If expression refs an element that is itself, read current value
            if (refs.Count == 1 && _elements.ContainsKey(refs[0]))
            {
                var refEl = _elements[refs[0]];
                object ev2 = refEl switch
                {
                    Slider sRef => sRef.Value,
                    TextBox tRef => tRef.Text,
                    CheckBox cbRef => cbRef.IsChecked ?? false,
                    ToggleButton tbRef => tbRef.IsChecked ?? false,
                    _ => ""
                };
                _store.Set(b.TargetVar, ev2);
                return;
            }

            var val = _eval.EvaluateString(b.Expression);
            _store.Set(b.TargetVar, val);
            return;
        }
        object ev = el switch
        {
            Slider sl => sl.Value,
            TextBox tx => tx.Text,
            CheckBox cb => cb.IsChecked ?? false,
            ToggleButton tb => tb.IsChecked ?? false,
            _ => ""
        };
        _store.Set(b.TargetVar, ev);
    }

    private void ApplyContainment(FrameworkElement el, ElementDecl n)
    {
        string? parentId = null;
        foreach (var p in n.Props)
            if (p.Key == "IN" && p.Value is RefExpr(var pid))
                parentId = pid;

        if (parentId == null) return;
        if (!_elements.TryGetValue(parentId, out var parent)) return;

        AddChild(parent, el);
    }

    private void AddChild(FrameworkElement parent, FrameworkElement child)
    {
        // Auto-assign Grid row/column if not explicitly set
        if (parent is Grid g && Grid.GetRow(child) == 0 && Grid.GetColumn(child) == 0)
        {
            if (!_gridChildCount.TryGetValue(parent, out int idx)) idx = 0;
            int cols = Math.Max(1, g.ColumnDefinitions.Count);
            int rows = Math.Max(1, g.RowDefinitions.Count);
            if (cols == 1)
            {
                // Single column: stack down rows
                if (idx < rows) Grid.SetRow(child, idx);
            }
            else
            {
                // Multi-column: fill row by row
                Grid.SetRow(child, idx / cols);
                Grid.SetColumn(child, idx % cols);
            }
            _gridChildCount[parent] = idx + 1;
        }

        switch (parent)
        {
            case Panel panel: panel.Children.Add(child); break;
            case Border border:
                if (border.Child == null) border.Child = child;
                else
                {
                    if (border.Child is Panel existingPanel) { existingPanel.Children.Add(child); }
                    else
                    {
                        var sp = new StackPanel();
                        var old = border.Child;
                        border.Child = null;
                        sp.Children.Add(old);
                        sp.Children.Add(child);
                        border.Child = sp;
                    }
                }
                break;
            case TabControl tc when child is TabItem ti: tc.Items.Add(ti); break;
            case TabItem tab:
                if (tab.Content == null) tab.Content = child;
                break;
            case ScrollViewer sv: sv.Content = child; break;
            case GroupBox gb: gb.Content = child; break;
            case Expander ex: ex.Content = child; break;
            case TreeViewItem tvi when child is TreeViewItem:
                tvi.Items.Add(child); break;
            case ItemsControl ic:
                ic.Items.Add(child); break;
            case Window w:
                w.Content = child; break;
        }
    }

    // ── 3D Scene ─────────────────────────────────────────────────────────────

    private static void BuildViewport3D(Viewport3D vp)
    {
        vp.Camera = new PerspectiveCamera
        {
            Position = new Point3D(3, 3, 5),
            LookDirection = new Vector3D(-3, -3, -5),
            UpDirection = new Vector3D(0, 1, 0),
            FieldOfView = 50
        };

        var mesh = new MeshGeometry3D
        {
            Positions = new Point3DCollection
            {
                new(-1,-1,-1), new(1,-1,-1), new(1,1,-1), new(-1,1,-1),
                new(-1,-1, 1), new(1,-1, 1), new(1,1, 1), new(-1,1, 1)
            },
            TriangleIndices = new Int32Collection
            {
                0,1,2, 0,2,3,
                4,6,5, 4,7,6,
                0,3,7, 0,7,4,
                1,5,6, 1,6,2,
                3,2,6, 3,6,7,
                0,4,5, 0,5,1
            }
        };

        var mat = new MaterialGroup();
        mat.Children.Add(new DiffuseMaterial(new LinearGradientBrush(
            Color.FromRgb(0x63, 0x66, 0xF1),
            Color.FromRgb(0x06, 0xB6, 0xD4),
            new Point(0, 0), new Point(1, 1))));
        mat.Children.Add(new SpecularMaterial(Brushes.White, 40));

        var rotation = new AxisAngleRotation3D(new Vector3D(0.6, 1, 0.3), 0);
        var rotTrans = new RotateTransform3D(rotation);

        var model = new GeometryModel3D(mesh, mat) { Transform = rotTrans };

        var group = new Model3DGroup();
        group.Children.Add(new AmbientLight(Color.FromRgb(0x33, 0x33, 0x33)));
        group.Children.Add(new DirectionalLight(Colors.White, new Vector3D(-1, -1, -1)));
        group.Children.Add(model);

        var visual = new ModelVisual3D { Content = group };
        vp.Children.Add(visual);

        // Spin animation
        var anim = new DoubleAnimation(0, 360, new Duration(TimeSpan.FromSeconds(8)))
        { RepeatBehavior = RepeatBehavior.Forever };
        rotation.BeginAnimation(AxisAngleRotation3D.AngleProperty, anim);
    }

    // ── FlowDocument ─────────────────────────────────────────────────────────

    private static void BuildFlowDoc(FlowDocumentReader reader)
    {
        var doc = new System.Windows.Documents.FlowDocument
        {
            FontFamily = new FontFamily("Segoe UI"),
            FontSize = 13,
            PagePadding = new Thickness(12)
        };

        var title = new System.Windows.Documents.Paragraph(
            new System.Windows.Documents.Run("A typographic showcase"))
        { FontSize = 20, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x0F, 0x17, 0x2A)) };
        doc.Blocks.Add(title);

        var intro = new System.Windows.Documents.Paragraph();
        intro.Foreground = new SolidColorBrush(Color.FromRgb(0x47, 0x55, 0x69));
        intro.Inlines.Add(new System.Windows.Documents.Run("WPF's "));
        intro.Inlines.Add(new System.Windows.Documents.Bold(new System.Windows.Documents.Run("FlowDocument")));
        intro.Inlines.Add(new System.Windows.Documents.Run(" supports rich inline formatting, lists, tables, floaters, and on-the-fly column reflow."));
        doc.Blocks.Add(intro);

        var list = new System.Windows.Documents.List { MarkerStyle = System.Windows.TextMarkerStyle.Disc };
        list.ListItems.Add(new System.Windows.Documents.ListItem(new System.Windows.Documents.Paragraph(new System.Windows.Documents.Run("Bullet one"))));
        list.ListItems.Add(new System.Windows.Documents.ListItem(new System.Windows.Documents.Paragraph(new System.Windows.Documents.Run("Bullet two"))));
        list.ListItems.Add(new System.Windows.Documents.ListItem(new System.Windows.Documents.Paragraph(new System.Windows.Documents.Run("Bullet three"))));
        doc.Blocks.Add(list);

        var lorem = new System.Windows.Documents.Paragraph(new System.Windows.Documents.Run(
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation."));
        lorem.Foreground = new SolidColorBrush(Color.FromRgb(0x47, 0x55, 0x69));
        doc.Blocks.Add(lorem);

        reader.Document = doc;
    }

    // ── RichTextBox ──────────────────────────────────────────────────────────

    private static void BuildRichTextBox(RichTextBox rtb)
    {
        var doc = new System.Windows.Documents.FlowDocument();
        var para = new System.Windows.Documents.Paragraph();
        para.Inlines.Add(new System.Windows.Documents.Bold(new System.Windows.Documents.Run("Edit me! ")));
        para.Inlines.Add(new System.Windows.Documents.Run("Select text and use the toolbar above — these are built-in "));
        para.Inlines.Add(new System.Windows.Documents.Italic(new System.Windows.Documents.Run("EditingCommands")));
        para.Inlines.Add(new System.Windows.Documents.Run(" from WPF."));
        doc.Blocks.Add(para);
        rtb.Document = doc;
    }

    // ── Animations ───────────────────────────────────────────────────────────

    private void BuildPulseAnimation(FrameworkElement canvasEl)
    {
        canvasEl.Loaded += (_, _) =>
        {
            if (_elements.TryGetValue("PulseDot", out var dot) && dot is Ellipse ell)
            {
                Canvas.SetLeft(ell, 50); Canvas.SetTop(ell, 50);

                var animW = new DoubleAnimation(40, 120, TimeSpan.FromSeconds(0.8))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new CubicEase { EasingMode = EasingMode.EaseInOut } };
                var animH = new DoubleAnimation(40, 120, TimeSpan.FromSeconds(0.8))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new CubicEase { EasingMode = EasingMode.EaseInOut } };
                ell.BeginAnimation(FrameworkElement.WidthProperty, animW);
                ell.BeginAnimation(FrameworkElement.HeightProperty, animH);
            }
        };
    }

    private void BuildColorAnimation(FrameworkElement boxEl)
    {
        boxEl.Loaded += (_, _) =>
        {
            var brush = new SolidColorBrush(Color.FromRgb(0x3B, 0x82, 0xF6));
            if (boxEl is Border bd) bd.Background = brush;
            var anim = new ColorAnimation(
                Color.FromRgb(0x3B, 0x82, 0xF6), Color.FromRgb(0xEC, 0x48, 0x99),
                TimeSpan.FromSeconds(1.5))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
            brush.BeginAnimation(SolidColorBrush.ColorProperty, anim);
        };
    }

    private void BuildSpinAnimation(FrameworkElement canvasEl)
    {
        canvasEl.Loaded += (_, _) =>
        {
            if (_elements.TryGetValue("SpinRect", out var rect) && rect is Rectangle r)
            {
                Canvas.SetLeft(r, 60); Canvas.SetTop(r, 40);
                r.RenderTransformOrigin = new Point(0.5, 0.5);
                var rotate = new RotateTransform(0);
                r.RenderTransform = rotate;
                var anim = new DoubleAnimation(0, 360, TimeSpan.FromSeconds(2))
                { RepeatBehavior = RepeatBehavior.Forever };
                rotate.BeginAnimation(RotateTransform.AngleProperty, anim);
            }
        };
    }

    private void BuildKeyframeAnimation(FrameworkElement canvasEl)
    {
        canvasEl.Loaded += (_, _) =>
        {
            if (_elements.TryGetValue("KfDot", out var dot) && dot is Ellipse kfEll)
            {
                Canvas.SetLeft(kfEll, 20); Canvas.SetTop(kfEll, 60);
                var translate = new TranslateTransform(0, 0);
                kfEll.RenderTransform = translate;
                var kf = new DoubleAnimationUsingKeyFrames { RepeatBehavior = RepeatBehavior.Forever };
                kf.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.Zero)));
                kf.KeyFrames.Add(new SplineDoubleKeyFrame(200, KeyTime.FromTimeSpan(TimeSpan.FromSeconds(1)),
                    new KeySpline(0.4, 0, 0.2, 1)));
                kf.KeyFrames.Add(new DiscreteDoubleKeyFrame(200, KeyTime.FromTimeSpan(TimeSpan.FromSeconds(1.2))));
                kf.KeyFrames.Add(new SplineDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromSeconds(2.4)),
                    new KeySpline(0.4, 0, 0.2, 1)));
                translate.BeginAnimation(TranslateTransform.XProperty, kf);
            }
        };
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static SolidColorBrush ParseBrush(string s)
    {
        try { return new SolidColorBrush((Color)ColorConverter.ConvertFromString(s)); }
        catch { return Brushes.Transparent; }
    }

    private static Thickness ParseThickness(string s)
    {
        var parts = s.Split(',');
        return parts.Length switch
        {
            1 when double.TryParse(parts[0], out double v) => new Thickness(v),
            2 when double.TryParse(parts[0], out double h) && double.TryParse(parts[1], out double v2)
                => new Thickness(h, v2, h, v2),
            4 => new Thickness(
                double.TryParse(parts[0], out double l) ? l : 0,
                double.TryParse(parts[1], out double t) ? t : 0,
                double.TryParse(parts[2], out double r) ? r : 0,
                double.TryParse(parts[3], out double b) ? b : 0),
            _ => new Thickness(0)
        };
    }

    private static void SetPlaceholder(TextBox tb, string hint)
    {
        void Refresh(object? s, EventArgs e)
        {
            if (tb.Text.Length == 0)
            {
                var block = new TextBlock
                {
                    Text = hint,
                    Foreground = new SolidColorBrush(Color.FromRgb(0xAA, 0xAA, 0xAA)),
                    FontStyle = FontStyles.Italic,
                    Margin = new Thickness(4, 1, 0, 0)
                };
                tb.Background = new VisualBrush(block)
                { Stretch = Stretch.None, AlignmentX = AlignmentX.Left, AlignmentY = AlignmentY.Center };
            }
            else tb.Background = Brushes.White;
        }
        tb.Loaded += (s, e) => Refresh(s, e);
        tb.TextChanged += (s, e) => Refresh(s, e);
    }

    private void RegisterBuiltinActions()
    {
        _actions["MSG_INFO"] = () => { var r = MessageBox.Show("This is some info.", "Info", MessageBoxButton.OK, MessageBoxImage.Information); _store.Set("DIALOG_MSG_RESULT", $"Info: {r}"); };
        _actions["MSG_WARN"] = () => { var r = MessageBox.Show("Heads up!", "Warning", MessageBoxButton.OK, MessageBoxImage.Warning); _store.Set("DIALOG_MSG_RESULT", $"Warn: {r}"); };
        _actions["MSG_ERROR"] = () => { var r = MessageBox.Show("Something went wrong.", "Error", MessageBoxButton.OK, MessageBoxImage.Error); _store.Set("DIALOG_MSG_RESULT", $"Error: {r}"); };
        _actions["MSG_CONFIRM"] = () => { var r = MessageBox.Show("Proceed?", "Confirm", MessageBoxButton.YesNoCancel, MessageBoxImage.Question); _store.Set("DIALOG_MSG_RESULT", $"Confirm: {r}"); };
        _actions["DIALOG_FILE"] = () =>
        {
            var dlg = new Microsoft.Win32.OpenFileDialog { Filter = "All files (*.*)|*.*" };
            if (dlg.ShowDialog() == true) _store.Set("DIALOG_FILE_RESULT", $"Opened: {dlg.FileName}");
        };
        _actions["DIALOG_SAVE"] = () =>
        {
            var dlg = new Microsoft.Win32.SaveFileDialog { Filter = "Text (*.txt)|*.txt|All files (*.*)|*.*" };
            if (dlg.ShowDialog() == true) _store.Set("DIALOG_FILE_RESULT", $"Saved: {dlg.FileName}");
        };
        _actions["CLIP_COPY"] = () =>
        {
            var text = ExpressionEvaluator.ToString2(_store.Get("CLIP_TEXT"));
            if (!string.IsNullOrEmpty(text)) Clipboard.SetText(text);
        };
        _actions["CLIP_PASTE"] = () =>
        {
            if (Clipboard.ContainsText()) _store.Set("CLIP_TEXT", Clipboard.GetText());
        };
        _actions["ASYNC_START"] = () => RunAsyncTask();
    }

    private async void RunAsyncTask()
    {
        _store.Set("ASYNC_STATUS", "working…");
        for (int i = 0; i <= 100; i += 5)
        {
            _store.Set("ASYNC_PROGRESS", (double)i);
            await System.Threading.Tasks.Task.Delay(80);
        }
        _store.Set("ASYNC_STATUS", "done.");
    }
}
