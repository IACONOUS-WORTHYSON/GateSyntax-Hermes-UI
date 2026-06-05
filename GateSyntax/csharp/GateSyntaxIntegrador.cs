// GateSyntaxIntegrador.cs — C# / WPF
// Domain-agnostic GateSyntax integrador.
//
// Drop into any C# project that references GateSyntax-CSharp.
// Reflects on [GsExpose]-annotated members, auto-generates .ui declarations,
// and runs a live sync loop so the UI always mirrors the host program's state.
//
// Usage:
//   var ig = new GateSyntaxIntegrador(this);   // reflect on current object
//   ig.Run();                                   // opens the live GateSyntax window
//
// Or fluent registration:
//   GateSyntaxIntegrador.Create()
//       .Bind("speed",  () => _speed,  v => _speed = v,  min: 0, max: 200)
//       .Action("Reset", () => _speed = 0)
//       .Run();

using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;
using System.Windows.Threading;
using GateSyntax.Runtime;          // GateSyntax-CSharp runtime

namespace GateSyntax
{
    // ── Attribute ─────────────────────────────────────────────────────────────

    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Method)]
    public sealed class GsExposeAttribute : Attribute
    {
        public string? Label { get; init; }
        public double  Min   { get; init; } = 0;
        public double  Max   { get; init; } = 100;
        public string? Group { get; init; }
    }

    // ── Binding descriptor ────────────────────────────────────────────────────

    internal sealed class GsBinding
    {
        public string          Name    { get; init; } = "";
        public string          Label   { get; init; } = "";
        public Func<object?>?  Getter  { get; init; }
        public Action<object>? Setter  { get; init; }
        public Action?         Action  { get; init; }
        public double          Min     { get; init; } = 0;
        public double          Max     { get; init; } = 100;
        public Type?           Type    { get; init; }

        public bool IsAction  => Action  != null;
        public bool IsNumeric => Type == typeof(double) || Type == typeof(float)
                                  || Type == typeof(int) || Type == typeof(long);
        public bool IsBool    => Type == typeof(bool);
    }

    // ── Integrador ────────────────────────────────────────────────────────────

    public sealed class GateSyntaxIntegrador
    {
        private readonly List<GsBinding>     _bindings = new();
        private          StateStore?         _store;
        private          bool                _running;
        private readonly double              _pollHz;

        public GateSyntaxIntegrador(double pollHz = 30) { _pollHz = pollHz; }

        // ── Fluent registration ───────────────────────────────────────────────

        public GateSyntaxIntegrador Bind(string name, Func<object?> getter,
            Action<object>? setter = null, double min = 0, double max = 100,
            string? label = null, Type? type = null)
        {
            _bindings.Add(new GsBinding
            {
                Name = name, Label = label ?? name,
                Getter = getter, Setter = setter,
                Min = min, Max = max,
                Type = type ?? getter()?.GetType() ?? typeof(string),
            });
            return this;
        }

        public GateSyntaxIntegrador Action(string name, Action fn, string? label = null)
        {
            _bindings.Add(new GsBinding { Name = name, Label = label ?? name, Action = fn });
            return this;
        }

        // ── Reflection discovery ──────────────────────────────────────────────

        public static GateSyntaxIntegrador FromObject(object host, double pollHz = 30)
        {
            var ig = new GateSyntaxIntegrador(pollHz);
            var type = host.GetType();

            foreach (var prop in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                var attr = prop.GetCustomAttribute<GsExposeAttribute>();
                if (attr == null) continue;
                ig.Bind(
                    name:   prop.Name,
                    getter: () => prop.GetValue(host),
                    setter: prop.CanWrite ? v => prop.SetValue(host, Convert.ChangeType(v, prop.PropertyType)) : null,
                    min:    attr.Min, max: attr.Max,
                    label:  attr.Label ?? prop.Name,
                    type:   prop.PropertyType
                );
            }

            foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance))
            {
                var attr = method.GetCustomAttribute<GsExposeAttribute>();
                if (attr == null || method.GetParameters().Length > 0) continue;
                ig.Action(method.Name, () => method.Invoke(host, null), attr.Label ?? method.Name);
            }

            return ig;
        }

        // ── UI generation ─────────────────────────────────────────────────────

        private string GenerateUi()
        {
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("WINDOW Root :: TITLE \"GateSyntax Integrador\"");
            sb.AppendLine("SCROLL MainScroll :: IN [Root]");
            sb.AppendLine("COL    MainCol    :: IN [MainScroll]");

            foreach (var b in _bindings)
            {
                string var_ = $"GS_{b.Name.ToUpper()}";

                if (b.IsAction)
                {
                    sb.AppendLine($"BUTTON {b.Name}Btn :: IN [MainCol] :: LABEL \"▶  {b.Label}\" :: ON CLICK /{var_}_CALL :: \"CALL_{b.Name.ToUpper()}\"\\");
                }
                else if (b.IsNumeric)
                {
                    double init = Convert.ToDouble(b.Getter?.Invoke() ?? b.Min);
                    sb.AppendLine($"/{var_} :: {init}\\");
                    sb.AppendLine($"LABEL  {b.Name}Lbl :: IN [MainCol] :: TEXT \"{b.Label}:  \" + [{var_}]");
                    sb.AppendLine($"SLIDER {b.Name}Sl  :: IN [MainCol] :: MIN {b.Min} :: MAX {b.Max} :: VALUE [{var_}] :: ON CHANGE /{var_} :: [{b.Name}Sl]\\");
                    sb.AppendLine($"RULE   {b.Name}Sep :: IN [MainCol]");
                }
                else if (b.IsBool)
                {
                    bool init = b.Getter?.Invoke() is true;
                    sb.AppendLine($"/{var_} :: {(init ? "TRUE" : "FALSE")}\\");
                    sb.AppendLine($"TOGGLE {b.Name}Tog :: IN [MainCol] :: LABEL \"{b.Label}\" :: VALUE [{var_}] :: ON CHANGE /{var_} :: [{b.Name}Tog]\\");
                }
                else
                {
                    string init = b.Getter?.Invoke()?.ToString() ?? "";
                    sb.AppendLine($"/{var_} :: \"{init}\"\\");
                    sb.AppendLine($"LABEL {b.Name}Lbl :: IN [MainCol] :: TEXT \"{b.Label}\"");
                    sb.AppendLine($"INPUT {b.Name}In  :: IN [MainCol] :: HINT \"Enter {b.Label}…\" :: ON CHANGE /{var_} :: [{b.Name}In]\\");
                }
            }

            return sb.ToString();
        }

        // ── Live sync loop ────────────────────────────────────────────────────

        private void LiveLoop()
        {
            double interval = 1000.0 / _pollHz;
            while (_running)
            {
                foreach (var b in _bindings)
                {
                    if (b.Getter == null) continue;
                    try
                    {
                        var current = b.Getter();
                        _store?.Set($"GS_{b.Name.ToUpper()}", current ?? "");
                    }
                    catch { /* host threw; skip */ }
                }
                Thread.Sleep((int)interval);
            }
        }

        // ── Entry point ───────────────────────────────────────────────────────

        public void Run()
        {
            var uiContent = GenerateUi();
            var (app, store) = new GateSyntaxBuilder()
                .AddContent(uiContent)
                .BuildWithState();

            _store = store;

            // Wire setters: UI change → host update
            foreach (var b in _bindings)
            {
                if (b.Setter == null) continue;
                var varName = $"GS_{b.Name.ToUpper()}";
                var setter  = b.Setter;
                store.Subscribe(varName, v => setter(v));
            }

            // Register action handlers
            foreach (var b in _bindings)
            {
                if (!b.IsAction) continue;
                var actionKey = $"CALL_{b.Name.ToUpper()}";
                var fn = b.Action!;
                app.RegisterAction(actionKey, fn);
            }

            // Start live poll thread
            _running = true;
            var thread = new Thread(LiveLoop) { IsBackground = true };
            thread.Start();

            app.Run();
            _running = false;
        }

        // ── Static factories ──────────────────────────────────────────────────

        public static GateSyntaxIntegrador Create(double pollHz = 30) => new(pollHz);
        public static void RunFor(object host) => FromObject(host).Run();
    }
}
