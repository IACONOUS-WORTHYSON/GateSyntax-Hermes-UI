// Line-oriented parser — mirrors GateSyntax.Runtime.SyntaxParser.cs
import {
  SyntaxNode, ElementDecl, StateDecl, Property, Behavior,
  ValueExpr, LiteralExpr, RefExpr, BinaryExpr,
  literal, ref, binary,
} from './syntax_node';

const SEP = ' :: ';

export class SyntaxParser {
  parseContent(content: string, sourceName = 'inline.ui'): SyntaxNode[] {
    void sourceName;
    return content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//') && !l.startsWith('#'))
      .flatMap(l => {
        const node = this.parseLine(l);
        return node ? [node] : [];
      });
  }

  private parseLine(line: string): SyntaxNode | null {
    const tokens = line.split(SEP);
    if (!tokens.length) return null;
    return tokens[0].trimStart().startsWith('/')
      ? this.parseStateDecl(tokens)
      : this.parseElementDecl(tokens);
  }

  private parseStateDecl(tokens: string[]): StateDecl {
    const name = tokens[0].trimStart().replace(/^\//, '').trim();
    const raw   = tokens[1]?.replace(/\\$/, '').trim() ?? '';
    const saved = tokens.slice(2).some(t => t.trim().toUpperCase() === 'SAVED');
    return { kind: 'state', name, defaultValue: SyntaxParser.parseLiteral(raw), saved };
  }

  private parseElementDecl(tokens: string[]): ElementDecl {
    const first = tokens[0].trim();
    const sp    = first.indexOf(' ');
    const noun  = (sp < 0 ? first : first.slice(0, sp)).toUpperCase();
    const id    = sp < 0 ? first : first.slice(sp + 1).trim();

    const props: Property[] = [];
    const behaviors: Behavior[] = [];

    let i = 1;
    while (i < tokens.length) {
      const seg = tokens[i].trim();
      if (seg.toUpperCase().startsWith('ON ')) {
        const parts = seg.split(/\s+/);
        if (parts.length >= 3) {
          const eventName = parts[1].toUpperCase();
          const targetVar = parts[2].replace(/^\//, '').trim();
          const expr = tokens[i + 1]?.replace(/\\$/, '').trim() ?? '';
          i++;
          behaviors.push({ event: eventName, targetVar, expression: expr });
        } else if (parts.length === 2) {
          const eventName = parts[1].toUpperCase();
          const expr = tokens[i + 1]?.replace(/\\$/, '').trim() ?? '';
          i++;
          behaviors.push({ event: eventName, targetVar: '__noop__', expression: expr });
        }
      } else {
        const sp2 = seg.indexOf(' ');
        if (sp2 < 0) {
          props.push({ key: seg.toUpperCase(), value: literal(true) });
        } else {
          const key = seg.slice(0, sp2).toUpperCase();
          const val = seg.slice(sp2 + 1).trim();
          props.push({ key, value: SyntaxParser.parseValueExpr(val) });
        }
      }
      i++;
    }

    return { kind: 'element', noun, id, props, behaviors };
  }

  static parseValueExpr(s: string): ValueExpr {
    const parts = SyntaxParser.tokenizeExpr(s.trim());
    if (!parts.length) return literal('');
    if (parts.length === 1) return SyntaxParser.parseSingleToken(parts[0]);
    let left = SyntaxParser.parseSingleToken(parts[0]);
    for (let i = 1; i < parts.length - 1; i += 2) {
      left = binary(left, parts[i], SyntaxParser.parseSingleToken(parts[i + 1]));
    }
    return left;
  }

  private static tokenizeExpr(s: string): string[] {
    const result: string[] = [];
    let buf = '';
    let inQuote = false;
    let inRef = false;
    for (const ch of s) {
      if      (ch === '"')              { inQuote = !inQuote; buf += ch; }
      else if (ch === '[')              { inRef = true;  buf += ch; }
      else if (ch === ']')              { inRef = false; buf += ch; }
      else if (ch === ' ' && !inQuote && !inRef) { if (buf) { result.push(buf); buf = ''; } }
      else                              { buf += ch; }
    }
    if (buf) result.push(buf);
    return result;
  }

  private static parseSingleToken(t: string): LiteralExpr | RefExpr {
    t = t.trim();
    if (t.startsWith('[') && t.endsWith(']')) return ref(t.slice(1, -1));
    return literal(SyntaxParser.parseLiteral(t));
  }

  static parseLiteral(s: string): unknown {
    s = s.trim().replace(/\\$/, '').trim();
    if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
    if (s.toUpperCase() === 'TRUE')  return true;
    if (s.toUpperCase() === 'FALSE') return false;
    const n = Number(s);
    if (!isNaN(n) && s !== '') return n;
    return s;
  }
}

// Re-export for external consumers
export type { LiteralExpr, RefExpr, BinaryExpr };
