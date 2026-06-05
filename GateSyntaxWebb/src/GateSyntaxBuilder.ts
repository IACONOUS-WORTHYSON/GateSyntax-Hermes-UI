import { SyntaxParser } from './runtime/syntax_parser';
import { StateStore } from './runtime/state_store';
import { DomRuntime, GateSyntaxApp } from './runtime/dom_runtime';
import { StateDecl } from './runtime/syntax_node';

export interface UiSource { content: string; name: string; }

export class GateSyntaxBuilder {
  private sources:       UiSource[] = [];
  private customActions: { name: string; action: () => void }[] = [];

  addContent(content: string, name = 'inline.ui'): this {
    this.sources.push({ content, name }); return this;
  }

  addContents(sources: UiSource[]): this {
    this.sources.push(...sources); return this;
  }

  registerAction(name: string, action: () => void): this {
    this.customActions.push({ name, action }); return this;
  }

  build(): GateSyntaxApp {
    const parser = new SyntaxParser();
    const store  = new StateStore();

    const ordered = [
      ...this.sources.filter(s => s.name.toLowerCase() === 'main.ui'),
      ...this.sources
        .filter(s => s.name.toLowerCase() !== 'main.ui')
        .sort((a, b) => a.name.localeCompare(b.name)),
    ];

    const nodes = ordered.flatMap(({ content, name }) =>
      parser.parseContent(content, name));

    for (const n of nodes)
      if (n.kind === 'state') store.setDefault((n as StateDecl).name, (n as StateDecl).defaultValue);

    const runtime = new DomRuntime(nodes, store);
    for (const { name, action } of this.customActions)
      (runtime as unknown as Record<string, Map<string, () => void>>)['actions'].set(name.toUpperCase(), action);

    return new GateSyntaxApp(runtime);
  }

  static fromContents(sources: UiSource[]): GateSyntaxBuilder {
    return new GateSyntaxBuilder().addContents(sources);
  }
}
