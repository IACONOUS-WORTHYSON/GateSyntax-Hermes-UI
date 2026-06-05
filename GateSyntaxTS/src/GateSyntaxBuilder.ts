// Fluent builder — mirrors GateSyntax.GateSyntaxBuilder.cs
import { SyntaxParser } from './runtime/syntax_parser';
import { StateStore } from './runtime/state_store';
import { UIRuntime } from './runtime/ui_runtime';
import { StateDecl } from './runtime/syntax_node';

export interface UiSource { content: string; name: string; }

export class GateSyntaxBuilder {
  private sources:       UiSource[] = [];
  private customActions: { name: string; action: () => void }[] = [];

  addContent(content: string, name = 'inline.ui'): this {
    this.sources.push({ content, name });
    return this;
  }

  addContents(sources: UiSource[]): this {
    this.sources.push(...sources);
    return this;
  }

  registerAction(name: string, action: () => void): this {
    this.customActions.push({ name, action });
    return this;
  }

  build(): UIRuntime {
    const parser = new SyntaxParser();
    const store  = new StateStore();

    // main.ui first, then the rest alphabetically
    const ordered = [
      ...this.sources.filter(s => s.name.toLowerCase() === 'main.ui'),
      ...this.sources.filter(s => s.name.toLowerCase() !== 'main.ui').sort((a, b) => a.name.localeCompare(b.name)),
    ];

    const nodes = ordered.flatMap(({ content, name }) => parser.parseContent(content, name));

    for (const n of nodes) {
      if (n.kind === 'state') (n as StateDecl), store.setDefault(n.name, n.defaultValue);
    }

    const runtime = new UIRuntime(nodes, store);
    for (const { name, action } of this.customActions) {
      runtime['actions'].set(name.toUpperCase(), action);
    }
    return runtime;
  }

  static fromContents(sources: UiSource[]): GateSyntaxBuilder {
    return new GateSyntaxBuilder().addContents(sources);
  }
}
