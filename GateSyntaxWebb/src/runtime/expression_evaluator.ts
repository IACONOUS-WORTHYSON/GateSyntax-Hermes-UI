// Expression evaluator — mirrors GateSyntax.Runtime.ExpressionEvaluator.cs
import { ValueExpr } from './syntax_node';
import { SyntaxParser } from './syntax_parser';
import { StateStore } from './state_store';

export class ExpressionEvaluator {
  constructor(private readonly store: StateStore) {}

  evaluate(expr: ValueExpr): unknown {
    switch (expr.kind) {
      case 'literal': return expr.value;
      case 'ref':     return this.store.get(expr.varName);
      case 'binary': {
        const l = this.evaluate(expr.left);
        const r = this.evaluate(expr.right);
        return this.applyOp(l, expr.op, r);
      }
    }
  }

  evaluateString(s: string): unknown {
    return this.evaluate(SyntaxParser.parseValueExpr(s));
  }

  private applyOp(l: unknown, op: string, r: unknown): unknown {
    if (op === '+') {
      if (typeof l === 'string' || typeof r === 'string')
        return String(l) + String(r);
      return ExpressionEvaluator.toDouble(l) + ExpressionEvaluator.toDouble(r);
    }
    if (op === '-') return ExpressionEvaluator.toDouble(l) - ExpressionEvaluator.toDouble(r);
    if (op === '*' || op.toUpperCase() === 'X')
      return ExpressionEvaluator.toDouble(l) * ExpressionEvaluator.toDouble(r);
    if (op === '/') {
      const rv = ExpressionEvaluator.toDouble(r);
      return rv !== 0 ? ExpressionEvaluator.toDouble(l) / rv : 0;
    }
    return l;
  }

  static toDouble(v: unknown): number {
    if (typeof v === 'number') return v;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  static toBool(v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number')  return v !== 0;
    return !['', 'false', '0', 'no'].includes(String(v).toLowerCase());
  }

  static toStr(v: unknown): string {
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number' && Number.isInteger(v)) return String(v);
    return String(v ?? '');
  }
}
