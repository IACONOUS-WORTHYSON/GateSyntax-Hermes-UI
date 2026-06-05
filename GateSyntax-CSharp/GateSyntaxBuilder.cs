using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Markup;
using GateSyntax.Runtime;

namespace GateSyntax;

/// <summary>
/// Fluent builder for constructing a GateSyntax-powered WPF window.
/// </summary>
public sealed class GateSyntaxBuilder
{
    private readonly List<(string content, string name)> _sources = new();
    private readonly List<(string name, Action action)> _customActions = new();
    private readonly List<ResourceDictionary> _extraThemes = new();
    private bool _useBuiltinTheme = true;
    private bool _enablePersistence = true;
    private Action<StateStore>? _configure;

    // ── Source loading ──────────────────────────────────────────────────────

    public GateSyntaxBuilder AddFile(string path)
    {
        _sources.Add((File.ReadAllText(path), Path.GetFileName(path)));
        return this;
    }

    public GateSyntaxBuilder AddDirectory(string path, bool mainFirst = true)
    {
        if (!Directory.Exists(path))
            throw new DirectoryNotFoundException($"UI directory not found: {path}");

        var files = Directory.GetFiles(path, "*.ui");
        if (mainFirst)
        {
            var main = files.FirstOrDefault(f => f.EndsWith("main.ui", StringComparison.OrdinalIgnoreCase));
            if (main != null) AddFile(main);
            foreach (var f in files
                .Where(f => !f.EndsWith("main.ui", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f))
                AddFile(f);
        }
        else
        {
            foreach (var f in files.OrderBy(f => f))
                AddFile(f);
        }
        return this;
    }

    public GateSyntaxBuilder AddContent(string uiContent, string name = "inline.ui")
    {
        _sources.Add((uiContent, name));
        return this;
    }

    // ── Theme ───────────────────────────────────────────────────────────────

    /// <summary>Use (or skip) the built-in GateSyntax theme. Default: true.</summary>
    public GateSyntaxBuilder WithBuiltinTheme(bool use = true)
    {
        _useBuiltinTheme = use;
        return this;
    }

    /// <summary>Merge an additional ResourceDictionary into Application.Resources.</summary>
    public GateSyntaxBuilder WithTheme(ResourceDictionary dict)
    {
        _extraThemes.Add(dict);
        return this;
    }

    // ── Actions & state ─────────────────────────────────────────────────────

    public GateSyntaxBuilder RegisterAction(string name, Action action)
    {
        _customActions.Add((name, action));
        return this;
    }

    public GateSyntaxBuilder Configure(Action<StateStore> configure)
    {
        _configure = configure;
        return this;
    }

    /// <summary>Disable automatic JSON state persistence (enabled by default).</summary>
    public GateSyntaxBuilder WithPersistence(bool enable = true)
    {
        _enablePersistence = enable;
        return this;
    }

    // ── Build ───────────────────────────────────────────────────────────────

    public Window Build() => BuildWithState().window;

    public (Window window, StateStore state) BuildWithState()
    {
        if (_useBuiltinTheme)
            LoadBuiltinTheme();
        foreach (var dict in _extraThemes)
            Application.Current.Resources.MergedDictionaries.Add(dict);

        var store = new StateStore();

        PersistenceService? persistence = null;
        if (_enablePersistence)
        {
            persistence = new PersistenceService(store);
            persistence.Restore();
        }

        _configure?.Invoke(store);

        var parser = new SyntaxParser();
        var nodes = new List<SyntaxNode>();
        foreach (var (content, name) in _sources)
            nodes.AddRange(parser.ParseContent(content, name));

        foreach (var n in nodes.OfType<StateDecl>())
            store.SetDefault(n.Name, n.DefaultValue);

        var runtime = new UIRuntime(nodes, store);
        foreach (var (name, action) in _customActions)
            runtime.RegisterAction(name, action);

        var window = runtime.Build();

        if (persistence != null)
        {
            persistence.RegisterNodes(nodes);
            Application.Current.Exit += (_, _) => persistence.Save();
        }

        return (window, store);
    }

    // ── Static convenience factories ────────────────────────────────────────

    public static GateSyntaxBuilder FromDirectory(string path) =>
        new GateSyntaxBuilder().AddDirectory(path);

    public static GateSyntaxBuilder FromFile(string path) =>
        new GateSyntaxBuilder().AddFile(path);

    public static GateSyntaxBuilder FromContent(string content) =>
        new GateSyntaxBuilder().AddContent(content);

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static void LoadBuiltinTheme()
    {
        var asm = typeof(GateSyntaxBuilder).Assembly;
        // Manifest resource name: {RootNamespace}.{Folder}.{File}
        using var stream = asm.GetManifestResourceStream("GateSyntax.Resources.Theme.xaml");
        if (stream == null) return;
        var dict = (ResourceDictionary)XamlReader.Load(stream);
        Application.Current.Resources.MergedDictionaries.Add(dict);
    }
}
