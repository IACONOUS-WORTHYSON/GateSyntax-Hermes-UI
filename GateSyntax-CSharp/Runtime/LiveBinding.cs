using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Threading;

namespace GateSyntax.Runtime;

public sealed class LiveBinding
{
    private readonly StateStore _store;
    private readonly ExpressionEvaluator _eval;

    public LiveBinding(StateStore store)
    {
        _store = store;
        _eval = new ExpressionEvaluator(store);
    }

    // Collect all var names referenced in an expression
    public static List<string> CollectRefs(ValueExpr expr)
    {
        var refs = new List<string>();
        Collect(expr, refs);
        return refs;
    }

    private static void Collect(ValueExpr e, List<string> refs)
    {
        switch (e)
        {
            case RefExpr(var n): refs.Add(n); break;
            case BinaryExpr(var l, _, var r): Collect(l, refs); Collect(r, refs); break;
        }
    }

    // Subscribe to all vars in expr; on any change call setter with new evaluated value.
    public void Bind(ValueExpr expr, Action<object> setter)
    {
        var refs = CollectRefs(expr);
        if (refs.Count == 0) return;

        // Fire once immediately so initial value is applied
        var initial = _eval.Evaluate(expr);
        setter(initial);

        foreach (var name in refs)
        {
            _store.Subscribe(name, _ =>
            {
                var newVal = _eval.Evaluate(expr);
                // Must update on dispatcher thread
                Application.Current?.Dispatcher.InvokeAsync(() => setter(newVal),
                    DispatcherPriority.DataBind);
            });
        }
    }

    // Convenience: bind expression string
    public void BindStr(string exprStr, Action<object> setter)
    {
        Bind(SyntaxParser.ParseValueExpr(exprStr), setter);
    }
}
