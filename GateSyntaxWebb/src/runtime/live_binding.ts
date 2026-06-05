// Collect [VAR] references from a ValueExpr tree
import { ValueExpr } from './syntax_node';

export function collectRefs(expr: ValueExpr): string[] {
  switch (expr.kind) {
    case 'ref':    return [expr.varName];
    case 'binary': return [...collectRefs(expr.left), ...collectRefs(expr.right)];
    default:       return [];
  }
}
