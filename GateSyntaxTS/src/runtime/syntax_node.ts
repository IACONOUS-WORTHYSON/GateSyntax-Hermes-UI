// AST node types — mirrors GateSyntax.Runtime.SyntaxNode.cs

export type ValueExpr = LiteralExpr | RefExpr | BinaryExpr;

export interface LiteralExpr { readonly kind: 'literal'; readonly value: unknown; }
export interface RefExpr      { readonly kind: 'ref';     readonly varName: string; }
export interface BinaryExpr   { readonly kind: 'binary';  readonly left: ValueExpr; readonly op: string; readonly right: ValueExpr; }

export function literal(value: unknown): LiteralExpr { return { kind: 'literal', value }; }
export function ref(varName: string):     RefExpr     { return { kind: 'ref', varName }; }
export function binary(left: ValueExpr, op: string, right: ValueExpr): BinaryExpr {
  return { kind: 'binary', left, op, right };
}

export interface Property {
  readonly key: string;
  readonly value: ValueExpr;
}

export interface Behavior {
  readonly event: string;
  readonly targetVar: string;
  readonly expression: string;
}

export interface ElementDecl {
  readonly kind: 'element';
  readonly noun: string;
  readonly id: string;
  readonly props: readonly Property[];
  readonly behaviors: readonly Behavior[];
}

export interface StateDecl {
  readonly kind: 'state';
  readonly name: string;
  readonly defaultValue: unknown;
  readonly saved: boolean;
}

export type SyntaxNode = ElementDecl | StateDecl;
