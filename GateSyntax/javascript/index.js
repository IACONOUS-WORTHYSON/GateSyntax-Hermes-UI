/**
 * GateSyntax Integrador — JavaScript (Vanilla / Browser)
 * Domain-agnostic live-binding layer for GateSyntaxPy-HTML (DOM runtime).
 *
 * Drop into any browser-based JavaScript application.
 * Pass any plain object or class instance; the integrador reflects on its
 * properties and methods, auto-generates GateSyntax .ui declarations, and
 * injects a live side-panel that stays in sync with the host object.
 *
 * Usage (browser module):
 *   import { GateSyntaxIntegrador } from './gatesyntax-integrador.js';
 *
 *   const state = { speed: 50, name: 'Hello', active: true };
 *   GateSyntaxIntegrador.runFor(state);          // injects panel + live loop
 *
 * Fluent:
 *   new GateSyntaxIntegrador()
 *     .bind('volume', () => audio.volume, v => { audio.volume = v; }, { min: 0, max: 1 })
 *     .action('Mute', () => { audio.muted = !audio.muted; })
 *     .mount('#gs-panel');
 */

// ── GateSyntax DOM runtime bridge ─────────────────────────────────────────────
// Resolved via the "gatesyntax-webb" peer dependency (npm install gatesyntax-webb).
// Override by passing { runtimePath } to the constructor, e.g.:
//   new GateSyntaxIntegrador({ runtimePath: './local-gs/index.js' })

const GS_RUNTIME_PATH = 'gatesyntax-webb';

// ── Binding descriptor ────────────────────────────────────────────────────────

class Binding {
  constructor({ name, label, getter, setter, action, min = 0, max = 100, type }) {
    this.name    = name;
    this.label   = label ?? name;
    this.getter  = getter  ?? null;
    this.setter  = setter  ?? null;
    this.action  = action  ?? null;
    this.min     = min;
    this.max     = max;
    this.type    = type ?? (getter ? typeof getter() : 'string');
  }

  get isAction()  { return this.action  !== null; }
  get isNumeric() { return this.type === 'number'; }
  get isBool()    { return this.type === 'boolean'; }
}

// ── Integrador ────────────────────────────────────────────────────────────────

export class GateSyntaxIntegrador {
  #bindings = [];
  #store    = null;
  #runtime  = null;
  #pollHz   = 30;
  #pollTimer = null;
  #title    = 'GateSyntax Integrador';

  #runtimePath;
  constructor({ pollHz = 30, title = 'GateSyntax Integrador', runtimePath } = {}) {
    this.#pollHz      = pollHz;
    this.#title       = title;
    this.#runtimePath = runtimePath ?? GS_RUNTIME_PATH;
  }

  // ── Fluent registration ─────────────────────────────────────────────────────

  /**
   * Expose a value binding.
   * @param {string} name
   * @param {() => any} getter
   * @param {(v: any) => void} [setter]
   * @param {{ min?, max?, label?, type? }} [opts]
   */
  bind(name, getter, setter, opts = {}) {
    const type = opts.type ?? typeof getter();
    this.#bindings.push(new Binding({
      name, label: opts.label ?? name,
      getter, setter,
      min: opts.min ?? 0, max: opts.max ?? 100,
      type,
    }));
    return this;
  }

  /**
   * Expose a zero-argument function as an action button.
   */
  action(name, fn, label) {
    this.#bindings.push(new Binding({ name, label: label ?? name, action: fn }));
    return this;
  }

  // ── Object reflection ───────────────────────────────────────────────────────

  /**
   * Auto-discover bindable properties and methods from any object.
   * Uses a Proxy to intercept mutations for immediate sync (no poll needed for simple objects).
   */
  static fromObject(obj, opts = {}) {
    const ig = new GateSyntaxIntegrador(opts);

    // Wrap with Proxy so property writes trigger UI sync immediately
    const proxy = new Proxy(obj, {
      set(target, key, value) {
        target[key] = value;
        // Notify integrador if already running
        if (ig.#store) {
          ig.#store.set(`GS_${String(key).toUpperCase()}`, value);
        }
        return true;
      },
    });

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'function') {
        ig.action(key, val.bind(obj));
      } else {
        ig.bind(
          key,
          () => proxy[key],
          v  => { proxy[key] = v; },
          { type: typeof val },
        );
      }
    }

    return ig;
  }

  // ── .ui generation ──────────────────────────────────────────────────────────

  #generateUi() {
    const lines = [
      `WINDOW Root :: TITLE "${this.#title}"`,
      'SCROLL MainScroll :: IN [Root]',
      'COL    MainCol    :: IN [MainScroll]',
    ];

    for (const b of this.#bindings) {
      const var_ = `GS_${b.name.toUpperCase()}`;

      if (b.isAction) {
        lines.push(
          `BUTTON ${b.name}Btn :: IN [MainCol]` +
          ` :: LABEL "▶  ${b.label}"` +
          ` :: ON CLICK /${var_}_CALL :: "CALL_${b.name.toUpperCase()}"\\`
        );

      } else if (b.isNumeric) {
        const init = b.getter ? Number(b.getter()) : b.min;
        lines.push(`/${var_} :: ${init}\\`);
        lines.push(`LABEL  ${b.name}Lbl :: IN [MainCol] :: TEXT "${b.label}:  " + [${var_}]`);
        lines.push(
          `SLIDER ${b.name}Sl :: IN [MainCol]` +
          ` :: MIN ${b.min} :: MAX ${b.max}` +
          ` :: VALUE [${var_}]` +
          ` :: ON CHANGE /${var_} :: [${b.name}Sl]\\`
        );
        lines.push(`RULE ${b.name}Sep :: IN [MainCol]`);

      } else if (b.isBool) {
        const init = b.getter ? !!b.getter() : false;
        lines.push(`/${var_} :: ${init ? 'TRUE' : 'FALSE'}\\`);
        lines.push(
          `TOGGLE ${b.name}Tog :: IN [MainCol]` +
          ` :: LABEL "${b.label}"` +
          ` :: VALUE [${var_}]` +
          ` :: ON CHANGE /${var_} :: [${b.name}Tog]\\`
        );

      } else {
        const init = b.getter ? String(b.getter()) : '';
        lines.push(`/${var_} :: "${init}"\\`);
        lines.push(`LABEL ${b.name}Lbl :: IN [MainCol] :: TEXT "${b.label}"`);
        lines.push(
          `INPUT ${b.name}In :: IN [MainCol]` +
          ` :: HINT "Enter ${b.label}…"` +
          ` :: ON CHANGE /${var_} :: [${b.name}In]\\`
        );
      }
    }

    return lines.join('\n');
  }

  // ── Live poll ───────────────────────────────────────────────────────────────

  #startLivePoll() {
    const interval = 1000 / this.#pollHz;
    this.#pollTimer = setInterval(() => {
      for (const b of this.#bindings) {
        if (!b.getter) continue;
        try {
          const val = b.getter();
          this.#store?.set(`GS_${b.name.toUpperCase()}`, val);
        } catch (_) { /* host threw; skip */ }
      }
    }, interval);
  }

  stop() {
    if (this.#pollTimer !== null) clearInterval(this.#pollTimer);
  }

  // ── Mount ────────────────────────────────────────────────────────────────────

  /**
   * Build and inject the GateSyntax UI into a container element.
   * @param {string|HTMLElement} container  CSS selector or element (default: creates a side-panel)
   */
  async mount(container = null) {
    // Load or reuse the GateSyntax DOM runtime
    const { GateSyntax } = await import(this.#runtimePath);

    const uiContent = this.#generateUi();
    const app = GateSyntax.fromContent(uiContent);

    // Resolve or create the container
    let el;
    if (container instanceof HTMLElement) {
      el = container;
    } else if (typeof container === 'string') {
      el = document.querySelector(container);
    }
    if (!el) {
      el = this.#createPanel();
      document.body.appendChild(el);
    }

    // Mount the GateSyntax app
    app.mount(el);
    this.#store  = app.runtime.store;
    this.#runtime = app.runtime;

    // UI → host: state changes call setters
    for (const b of this.#bindings) {
      if (!b.setter) continue;
      const varName = `GS_${b.name.toUpperCase()}`;
      const setter  = b.setter;
      this.#store.subscribe(varName, v => {
        try { setter(v); } catch (_) {}
      });
    }

    // Actions: subscribe to the _CALL var
    for (const b of this.#bindings) {
      if (!b.isAction) continue;
      const callVar = `GS_${b.name.toUpperCase()}_CALL`;
      const fn = b.action;
      this.#store.subscribe(callVar, () => {
        try { fn(); } catch (_) {}
      });
    }

    // Start host → UI live poll
    this.#startLivePoll();

    return this;
  }

  // ── Default side-panel ────────────────────────────────────────────────────────

  #createPanel() {
    const panel = document.createElement('div');
    panel.id = 'gs-integrador-panel';
    Object.assign(panel.style, {
      position:  'fixed',
      top:       '0',
      right:     '0',
      width:     '320px',
      height:    '100vh',
      zIndex:    '999999',
      boxShadow: '-4px 0 20px rgba(0,0,0,.5)',
      overflow:  'hidden',
    });

    // Toggle button
    const toggle = document.createElement('button');
    toggle.textContent = '⚙ GS';
    Object.assign(toggle.style, {
      position:  'fixed',
      top:       '8px',
      right:     '328px',
      zIndex:    '1000000',
      background:'#2e2e50',
      color:     '#e0e0e0',
      border:    '1px solid #44447a',
      borderRadius: '4px',
      padding:   '4px 10px',
      cursor:    'pointer',
      fontSize:  '12px',
    });
    let visible = true;
    toggle.addEventListener('click', () => {
      visible = !visible;
      panel.style.display  = visible ? '' : 'none';
      toggle.style.right   = visible ? '328px' : '8px';
    });
    document.body.appendChild(toggle);

    return panel;
  }

  // ── Static factories ──────────────────────────────────────────────────────────

  static runFor(obj, opts = {}) {
    return GateSyntaxIntegrador.fromObject(obj, opts).mount(opts.container);
  }
}
