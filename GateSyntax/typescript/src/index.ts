/**
 * GateSyntax Integrador — TypeScript (.ts)
 * Domain-agnostic live-binding layer for GateSyntaxWebb (pure DOM runtime).
 *
 * Generic over the host state shape: GateSyntaxIntegrador<T> gives full type
 * safety for bindings, setters, and action callbacks.
 *
 * Usage (typed state object):
 *   import { GateSyntaxIntegrador } from './gatesyntax-integrador';
 *
 *   interface AppState { speed: number; label: string; active: boolean; }
 *   const state: AppState = { speed: 50, label: 'Hello', active: true };
 *
 *   GateSyntaxIntegrador.runFor(state);          // auto-reflect + inject panel
 *
 * Fluent:
 *   new GateSyntaxIntegrador<AppState>()
 *     .bind('speed', () => state.speed, v => { state.speed = v; }, { min: 0, max: 200 })
 *     .action('Reset', () => { state.speed = 0; })
 *     .mount('#panel');
 */

// ── Import the GateSyntaxWebb DOM runtime ─────────────────────────────────────
// Resolved via peerDependency "@gatesyntax/webb" or a local path alias.
// In a Vite/webpack project add:  "@gatesyntax/webb": "../../GateSyntaxWebb/src"
import { GateSyntaxBuilder }         from '@gatesyntax/webb/GateSyntaxBuilder';
import { DomRuntime, GateSyntaxApp } from '@gatesyntax/webb/runtime/dom_runtime';
import { StateStore }                from '@gatesyntax/webb/runtime/state_store';

// ── Type helpers ──────────────────────────────────────────────────────────────

type Getter<V>  = () => V;
type Setter<V>  = (v: V) => void;
type GsType     = 'number' | 'boolean' | 'string';

interface BindOpts<V> {
  label?:  string;
  min?:    number;
  max?:    number;
  type?:   GsType;
  getter?: Getter<V>;
  setter?: Setter<V>;
}

// ── Binding descriptor ────────────────────────────────────────────────────────

class Binding<V = unknown> {
  readonly name:   string;
  readonly label:  string;
  readonly getter: Getter<V> | null;
  readonly setter: Setter<V> | null;
  readonly action: (() => void) | null;
  readonly min:    number;
  readonly max:    number;
  readonly gsType: GsType;

  constructor(opts: {
    name: string; label?: string;
    getter?: Getter<V> | null; setter?: Setter<V> | null;
    action?: (() => void) | null;
    min?: number; max?: number; gsType?: GsType;
  }) {
    this.name   = opts.name;
    this.label  = opts.label ?? opts.name;
    this.getter = opts.getter ?? null;
    this.setter = opts.setter ?? null;
    this.action = opts.action ?? null;
    this.min    = opts.min ?? 0;
    this.max    = opts.max ?? 100;

    // Infer type from current value if not provided
    const sample = this.getter?.();
    this.gsType  = opts.gsType
      ?? (typeof sample === 'number'  ? 'number'
        : typeof sample === 'boolean' ? 'boolean'
        : 'string');
  }

  get isAction()  { return this.action  !== null; }
  get isNumeric() { return this.gsType === 'number'; }
  get isBool()    { return this.gsType === 'boolean'; }
}

// ── Integrador ────────────────────────────────────────────────────────────────

export class GateSyntaxIntegrador<T extends object = Record<string, unknown>> {
  readonly #bindings: Binding[]  = [];
  #store:   StateStore  | null   = null;
  #app:     GateSyntaxApp | null = null;
  #timer:   ReturnType<typeof setInterval> | null = null;
  readonly #pollHz: number;
  readonly #title:  string;

  constructor({ pollHz = 30, title = 'GateSyntax Integrador' } = {}) {
    this.#pollHz = pollHz;
    this.#title  = title;
  }

  // ── Fluent registration ───────────────────────────────────────────────────

  bind<K extends keyof T>(
    name:   K & string,
    getter: Getter<T[K]>,
    setter?: Setter<T[K]>,
    opts:  Omit<BindOpts<T[K]>, 'getter' | 'setter'> = {},
  ): this {
    this.#bindings.push(new Binding<T[K]>({
      name: name as string,
      label:   opts.label,
      getter,
      setter:  setter ?? null,
      min:     opts.min,
      max:     opts.max,
      gsType:  opts.type,
    }));
    return this;
  }

  action(name: string, fn: () => void, label?: string): this {
    this.#bindings.push(new Binding({ name, label, action: fn }));
    return this;
  }

  // ── Object reflection ─────────────────────────────────────────────────────

  static fromObject<S extends object>(
    obj:  S,
    opts: { pollHz?: number; title?: string } = {},
  ): GateSyntaxIntegrador<S> {
    const ig = new GateSyntaxIntegrador<S>(opts);

    // Proxy intercepts property writes for immediate sync
    const proxy = new Proxy(obj, {
      set(target, key, value) {
        (target as Record<string | symbol, unknown>)[key] = value;
        if (ig.#store) ig.#store.set(`GS_${String(key).toUpperCase()}`, value);
        return true;
      },
    });

    for (const key of Object.keys(obj) as (keyof S & string)[]) {
      const val = obj[key];
      if (typeof val === 'function') {
        ig.action(key, (val as () => void).bind(obj));
      } else {
        ig.bind(
          key,
          () => proxy[key],
          (v) => { (proxy as Record<string, unknown>)[key as string] = v; },
          { type: typeof val as GsType },
        );
      }
    }

    return ig;
  }

  // ── .ui generation ────────────────────────────────────────────────────────

  #generateUi(): string {
    const lines: string[] = [
      `WINDOW Root :: TITLE "${this.#title}"`,
      'SCROLL MainScroll :: IN [Root]',
      'COL    MainCol    :: IN [MainScroll]',
    ];

    for (const b of this.#bindings) {
      const v = `GS_${b.name.toUpperCase()}`;

      if (b.isAction) {
        lines.push(
          `BUTTON ${b.name}Btn :: IN [MainCol]` +
          ` :: LABEL "▶  ${b.label}"` +
          ` :: ON CLICK /${v}_CALL :: "CALL_${b.name.toUpperCase()}"\\`,
        );

      } else if (b.isNumeric) {
        const init = b.getter != null ? Number(b.getter()) : b.min;
        lines.push(
          `/${v} :: ${init}\\`,
          `LABEL  ${b.name}Lbl :: IN [MainCol] :: TEXT "${b.label}:  " + [${v}]`,
          `SLIDER ${b.name}Sl  :: IN [MainCol]` +
            ` :: MIN ${b.min} :: MAX ${b.max}` +
            ` :: VALUE [${v}]` +
            ` :: ON CHANGE /${v} :: [${b.name}Sl]\\`,
          `RULE ${b.name}Sep :: IN [MainCol]`,
        );

      } else if (b.isBool) {
        const init = b.getter != null ? Boolean(b.getter()) : false;
        lines.push(
          `/${v} :: ${init ? 'TRUE' : 'FALSE'}\\`,
          `TOGGLE ${b.name}Tog :: IN [MainCol]` +
            ` :: LABEL "${b.label}"` +
            ` :: VALUE [${v}]` +
            ` :: ON CHANGE /${v} :: [${b.name}Tog]\\`,
        );

      } else {
        const init = b.getter != null ? String(b.getter()) : '';
        lines.push(
          `/${v} :: "${init}"\\`,
          `LABEL ${b.name}Lbl :: IN [MainCol] :: TEXT "${b.label}"`,
          `INPUT ${b.name}In  :: IN [MainCol]` +
            ` :: HINT "Enter ${b.label}…"` +
            ` :: ON CHANGE /${v} :: [${b.name}In]\\`,
        );
      }
    }

    return lines.join('\n');
  }

  // ── Live poll ─────────────────────────────────────────────────────────────

  #startPoll(): void {
    const ms = 1000 / this.#pollHz;
    this.#timer = setInterval(() => {
      for (const b of this.#bindings) {
        if (!b.getter) continue;
        try {
          const val = b.getter();
          this.#store?.set(`GS_${b.name.toUpperCase()}`, val as unknown);
        } catch { /* host threw */ }
      }
    }, ms);
  }

  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
  }

  // ── Mount ─────────────────────────────────────────────────────────────────

  mount(container?: string | HTMLElement | null): this {
    const uiContent = this.#generateUi();

    // Build via GateSyntaxWebb runtime
    const app = GateSyntaxBuilder.fromContents([{ content: uiContent, name: 'integrador.ui' }]).build();
    this.#app   = app;
    this.#store = (app as unknown as { runtime: DomRuntime }).runtime.store;

    // Resolve mount target
    let el: HTMLElement | null = null;
    if (container instanceof HTMLElement) el = container;
    else if (typeof container === 'string') el = document.querySelector<HTMLElement>(container);
    if (!el) { el = this.#createPanel(); document.body.appendChild(el); }

    app.mount(el.id ? `#${el.id}` : 'body');

    // UI → host
    for (const b of this.#bindings) {
      if (!b.setter) continue;
      const varName = `GS_${b.name.toUpperCase()}`;
      const setter  = b.setter as Setter<unknown>;
      this.#store.subscribe(varName, v => { try { setter(v); } catch { /* skip */ } });
    }

    // Actions
    for (const b of this.#bindings) {
      if (!b.isAction) continue;
      const callVar = `GS_${b.name.toUpperCase()}_CALL`;
      const fn = b.action!;
      this.#store.subscribe(callVar, () => { try { fn(); } catch { /* skip */ } });
    }

    this.#startPoll();
    return this;
  }

  // ── Side-panel factory ────────────────────────────────────────────────────

  #createPanel(): HTMLElement {
    const id    = `gs-integrador-${Date.now()}`;
    const panel = Object.assign(document.createElement('div'), { id });
    Object.assign(panel.style, {
      position: 'fixed', top: '0', right: '0',
      width: '300px', height: '100vh',
      zIndex: '999999', boxShadow: '-4px 0 20px rgba(0,0,0,.5)',
      overflow: 'hidden',
    });

    const toggle = Object.assign(document.createElement('button'), {
      textContent: '⚙ GS',
    });
    Object.assign(toggle.style, {
      position: 'fixed', top: '8px', right: '308px', zIndex: '1000000',
      background: '#2e2e50', color: '#e0e0e0', border: '1px solid #44447a',
      borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px',
    });

    let visible = true;
    toggle.addEventListener('click', () => {
      visible = !visible;
      panel.style.display = visible ? '' : 'none';
      toggle.style.right  = visible ? '308px' : '8px';
    });
    document.body.appendChild(toggle);
    return panel;
  }

  // ── Static factories ──────────────────────────────────────────────────────

  static runFor<S extends object>(obj: S, opts: { pollHz?: number; title?: string } = {}): void {
    GateSyntaxIntegrador.fromObject(obj, opts).mount();
  }
}
