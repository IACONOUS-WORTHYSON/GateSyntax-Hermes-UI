package com.gatesyntax.runtime;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Line-oriented parser — mirrors GateSyntax.Runtime.SyntaxParser. */
public class SyntaxParser {

    private static final String SEP = " :: ";

    public List<SyntaxNode> parseContent(String content, String sourceName) {
        return content.lines()
                .map(String::strip)
                .filter(l -> !l.isEmpty() && !l.startsWith("//") && !l.startsWith("#"))
                .flatMap(l -> parseLineOpt(l).stream())
                .toList();
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private java.util.Optional<SyntaxNode> parseLineOpt(String line) {
        String[] tokens = line.split(java.util.regex.Pattern.quote(SEP), -1);
        if (tokens.length == 0) return java.util.Optional.empty();
        SyntaxNode node = tokens[0].stripLeading().startsWith("/")
                ? parseStateDecl(tokens)
                : parseElementDecl(tokens);
        return java.util.Optional.ofNullable(node);
    }

    private StateDecl parseStateDecl(String[] tokens) {
        String name = tokens[0].stripLeading().replaceFirst("^/", "").strip();
        String raw  = tokens.length > 1 ? tokens[1].replaceAll("\\\\$", "").strip() : "";
        boolean saved = Arrays.stream(tokens).skip(2).anyMatch(t -> t.strip().equalsIgnoreCase("SAVED"));
        return new StateDecl(name, parseLiteral(raw), saved);
    }

    private ElementDecl parseElementDecl(String[] tokens) {
        String first = tokens[0].strip();
        int sp = first.indexOf(' ');
        String noun = (sp < 0 ? first : first.substring(0, sp)).toUpperCase();
        String id   = sp < 0 ? first : first.substring(sp + 1).strip();

        List<Property> props     = new ArrayList<>();
        List<Behavior> behaviors = new ArrayList<>();

        int i = 1;
        while (i < tokens.length) {
            String seg = tokens[i].strip();
            if (seg.toUpperCase().startsWith("ON ")) {
                String[] parts = seg.split("\\s+");
                if (parts.length >= 3) {
                    String event  = parts[1].toUpperCase();
                    String target = parts[2].replaceFirst("^/", "").strip();
                    String expr   = i + 1 < tokens.length ? tokens[i + 1].replaceAll("\\\\$", "").strip() : "";
                    i++;
                    behaviors.add(new Behavior(event, target, expr));
                } else if (parts.length == 2) {
                    String event = parts[1].toUpperCase();
                    String expr  = i + 1 < tokens.length ? tokens[i + 1].replaceAll("\\\\$", "").strip() : "";
                    i++;
                    behaviors.add(new Behavior(event, "__noop__", expr));
                }
            } else {
                int sp2 = seg.indexOf(' ');
                if (sp2 < 0) {
                    props.add(new Property(seg.toUpperCase(), new LiteralExpr(true)));
                } else {
                    String key = seg.substring(0, sp2).toUpperCase();
                    String val = seg.substring(sp2 + 1).strip();
                    props.add(new Property(key, parseValueExpr(val)));
                }
            }
            i++;
        }
        return new ElementDecl(noun, id, List.copyOf(props), List.copyOf(behaviors));
    }

    // ── Value expression parsing ──────────────────────────────────────────────

    public static ValueExpr parseValueExpr(String s) {
        List<String> parts = tokenizeExpr(s.strip());
        if (parts.isEmpty()) return new LiteralExpr("");
        if (parts.size() == 1) return parseSingleToken(parts.get(0));
        ValueExpr left = parseSingleToken(parts.get(0));
        for (int i = 1; i < parts.size() - 1; i += 2) {
            left = new BinaryExpr(left, parts.get(i), parseSingleToken(parts.get(i + 1)));
        }
        return left;
    }

    private static List<String> tokenizeExpr(String s) {
        List<String> result = new ArrayList<>();
        StringBuilder buf = new StringBuilder();
        boolean inQuote = false, inRef = false;
        for (char ch : s.toCharArray()) {
            if      (ch == '"')                    { inQuote = !inQuote; buf.append(ch); }
            else if (ch == '[')                    { inRef = true;  buf.append(ch); }
            else if (ch == ']')                    { inRef = false; buf.append(ch); }
            else if (ch == ' ' && !inQuote && !inRef) {
                if (!buf.isEmpty()) { result.add(buf.toString()); buf.setLength(0); }
            }
            else                                   { buf.append(ch); }
        }
        if (!buf.isEmpty()) result.add(buf.toString());
        return result;
    }

    private static ValueExpr parseSingleToken(String t) {
        t = t.strip();
        if (t.startsWith("[") && t.endsWith("]")) return new RefExpr(t.substring(1, t.length() - 1));
        return new LiteralExpr(parseLiteral(t));
    }

    static Object parseLiteral(String s) {
        s = s.strip().replaceAll("\\\\$", "").strip();
        if (s.startsWith("\"") && s.endsWith("\"")) return s.substring(1, s.length() - 1);
        if (s.equalsIgnoreCase("TRUE"))  return Boolean.TRUE;
        if (s.equalsIgnoreCase("FALSE")) return Boolean.FALSE;
        try { return Integer.parseInt(s); }   catch (NumberFormatException ignored) {}
        try { return Double.parseDouble(s); } catch (NumberFormatException ignored) {}
        return s;
    }
}
