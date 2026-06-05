using System;
using System.Collections.Generic;
using System.Globalization;

namespace GateSyntax.Runtime;

public sealed class ExpressionEvaluator(StateStore store)
{
    public object Evaluate(ValueExpr expr) => expr switch
    {
        LiteralExpr(var v) => v,
        RefExpr(var n) => store.Get(n),
        BinaryExpr(var l, var op, var r) => ApplyOp(Evaluate(l), op, Evaluate(r)),
        _ => ""
    };

    public object EvaluateString(string exprStr)
    {
        var expr = SyntaxParser.ParseValueExpr(exprStr);
        return Evaluate(expr);
    }

    private static object ApplyOp(object left, string op, object right)
    {
        double l = ToDouble(left);
        double r = ToDouble(right);
        return op switch
        {
            "+" => l + r,
            "-" => l - r,
            "X" or "x" or "*" => l * r,
            "/" => r == 0 ? l : l / r,
            _ => left
        };
    }

    public static double ToDouble(object v) => v switch
    {
        double d => d,
        int i => i,
        float f => f,
        long lg => lg,
        string s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0,
        bool b => b ? 1 : 0,
        _ => 0
    };

    public static bool ToBool(object v) => v switch
    {
        bool b => b,
        double d => d != 0,
        int i => i != 0,
        string s => s.Equals("true", StringComparison.OrdinalIgnoreCase) || s == "1",
        _ => false
    };

    public static string ToString2(object v) => v switch
    {
        double d => d.ToString(CultureInfo.InvariantCulture),
        float f => f.ToString(CultureInfo.InvariantCulture),
        _ => v?.ToString() ?? ""
    };
}
