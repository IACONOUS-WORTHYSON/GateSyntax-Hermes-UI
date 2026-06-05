using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace GateSyntax.Runtime;

public sealed class SyntaxParser
{
    private static readonly string[] Sep = [" :: "];

    public List<SyntaxNode> ParseFile(string path)
    {
        if (!File.Exists(path)) return [];
        return ParseContent(File.ReadAllText(path), Path.GetFileName(path));
    }

    public List<SyntaxNode> ParseContent(string content, string sourceName = "inline.ui")
    {
        var nodes = new List<SyntaxNode>();
        foreach (var raw in content.Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith("//") || line.StartsWith("#"))
                continue;
            var node = ParseLine(line);
            if (node != null) nodes.Add(node);
        }
        return nodes;
    }

    private SyntaxNode? ParseLine(string line)
    {
        var tokens = line.Split(Sep, StringSplitOptions.None);
        if (tokens.Length == 0) return null;

        if (tokens[0].TrimStart().StartsWith('/'))
            return ParseStateDecl(tokens);
        return ParseElementDecl(tokens);
    }

    // /VARNAME :: value\ :: SAVED?
    private static StateDecl ParseStateDecl(string[] tokens)
    {
        var name = tokens[0].TrimStart().TrimStart('/').Trim();
        object defaultValue = "";
        if (tokens.Length > 1)
            defaultValue = ParseLiteral(tokens[1].TrimEnd('\\').Trim());

        bool saved = false;
        for (int i = 2; i < tokens.Length; i++)
            if (tokens[i].Trim().Equals("SAVED", StringComparison.OrdinalIgnoreCase))
                saved = true;

        return new StateDecl(name, defaultValue, saved);
    }

    // First token: "NOUN IDENTIFIER ..."
    private static ElementDecl ParseElementDecl(string[] tokens)
    {
        var firstWord = tokens[0].Trim();
        var spaceIdx = firstWord.IndexOf(' ');
        string noun, id;
        if (spaceIdx < 0) { noun = firstWord; id = firstWord; }
        else { noun = firstWord[..spaceIdx]; id = firstWord[(spaceIdx + 1)..].Trim(); }

        var props = new List<Property>();
        var behaviors = new List<Behavior>();

        for (int i = 1; i < tokens.Length; i++)
        {
            var seg = tokens[i].Trim();
            if (seg.StartsWith("ON ", StringComparison.OrdinalIgnoreCase))
            {
                // ON EVENT /VAR :: expr\  — but expr may span additional tokens
                // We already split on " :: " so ON CLICK /N :: [N]+1\ will have
                // tokens[i]="ON CLICK /N", tokens[i+1]="[N]+1\"
                // Parse: ON <EVENT> /VARNAME
                var parts = seg.Split(' ', 3, StringSplitOptions.RemoveEmptyEntries);
                // parts[0]="ON", parts[1]=EVENT, parts[2]="/VARNAME"
                if (parts.Length >= 3)
                {
                    var eventName = parts[1];
                    var varName = parts[2].TrimStart('/').Trim();
                    // Expression is the next token (if it ends with \)
                    string expr = "";
                    if (i + 1 < tokens.Length)
                    {
                        expr = tokens[i + 1].TrimEnd('\\').Trim();
                        i++;
                    }
                    behaviors.Add(new Behavior(eventName, varName, expr));
                }
                else if (parts.Length == 2)
                {
                    // ON LOAD style with no var — store as special
                    var eventName = parts[1];
                    string expr = "";
                    if (i + 1 < tokens.Length) { expr = tokens[i + 1].TrimEnd('\\').Trim(); i++; }
                    behaviors.Add(new Behavior(eventName, "__noop__", expr));
                }
            }
            else
            {
                // PROPERTY: first word is key, rest is value expression
                var sp = seg.IndexOf(' ');
                if (sp < 0)
                {
                    props.Add(new Property(seg.ToUpperInvariant(), new LiteralExpr(true)));
                }
                else
                {
                    var key = seg[..sp].ToUpperInvariant();
                    var valStr = seg[(sp + 1)..].Trim();
                    props.Add(new Property(key, ParseValueExpr(valStr)));
                }
            }
        }

        return new ElementDecl(noun.ToUpperInvariant(), id, props, behaviors);
    }

    // Parse a value expression string into a ValueExpr tree
    public static ValueExpr ParseValueExpr(string s)
    {
        s = s.Trim();
        // Tokenize on whitespace, then build binary tree left-to-right
        var parts = TokenizeExpr(s);
        if (parts.Count == 0) return new LiteralExpr("");
        if (parts.Count == 1) return ParseSingleToken(parts[0]);

        // Left to right: token op token op ...
        ValueExpr left = ParseSingleToken(parts[0]);
        int idx = 1;
        while (idx < parts.Count - 1)
        {
            var op = parts[idx];
            var right = ParseSingleToken(parts[idx + 1]);
            left = new BinaryExpr(left, op, right);
            idx += 2;
        }
        return left;
    }

    private static List<string> TokenizeExpr(string s)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        bool inQuote = false;
        bool inRef = false;
        foreach (char c in s)
        {
            if (c == '"') { inQuote = !inQuote; sb.Append(c); }
            else if (c == '[') { inRef = true; sb.Append(c); }
            else if (c == ']') { inRef = false; sb.Append(c); }
            else if (c == ' ' && !inQuote && !inRef)
            {
                if (sb.Length > 0) { result.Add(sb.ToString()); sb.Clear(); }
            }
            else sb.Append(c);
        }
        if (sb.Length > 0) result.Add(sb.ToString());
        return result;
    }

    private static ValueExpr ParseSingleToken(string t)
    {
        t = t.Trim();
        if (t.StartsWith('[') && t.EndsWith(']'))
            return new RefExpr(t[1..^1]);
        return new LiteralExpr(ParseLiteral(t));
    }

    internal static object ParseLiteral(string s)
    {
        s = s.Trim().TrimEnd('\\').Trim();
        if (s.StartsWith('"') && s.EndsWith('"'))
            return s[1..^1];
        if (s.Equals("TRUE", StringComparison.OrdinalIgnoreCase)) return true;
        if (s.Equals("FALSE", StringComparison.OrdinalIgnoreCase)) return false;
        if (int.TryParse(s, out int iv)) return iv;
        if (double.TryParse(s, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out double dv)) return dv;
        return s;
    }
}
