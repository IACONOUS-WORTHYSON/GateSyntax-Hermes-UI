/**
 * GateSyntaxWebb — DOM runtime.
 *
 * Pure TypeScript → HTML DOM renderer.  No framework, no virtual DOM.
 * Each .ui noun maps to a concrete HTMLElement built with document.createElement.
 * Live bindings are wired directly as StateStore subscriptions that mutate DOM nodes.
 */
import {
  SyntaxNode, ElementDecl, StateDecl, Behavior, ValueExpr, RefExpr,
} from './syntax_node';
import { SyntaxParser } from './syntax_parser';
import { StateStore } from './state_store';
import { ExpressionEvaluator } from './expression_evaluator';
import { collectRefs } from './live_binding';

// ── Colour map ────────────────────────────────────────────────────────────────

const RICH: Record<string, string> = {
  bright_blue: '#4499ff', bright_red: '#ff5555', bright_yellow: '#ffd740',
  bright_green: '#55ee55', bright_cyan: '#55eeee', bright_magenta: '#ee55ee',
  bright_white: '#ffffff', blue: '#3366cc', red: '#cc3333', yellow: '#ccaa00',
  green: '#33aa33', cyan: '#33aaaa', magenta: '#aa33aa', white: '#cccccc',
  dim: '#777777',
};
const qcol = (c: string) => RICH[c.trim().toLowerCase()] ?? c;

// CSS class aliases applied by STYLE "h1" etc.
const STYLE_CLS: Record<string, string> = { h1: 'gs-h1', h2: 'gs-h2', muted: 'gs-muted' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, id: string, cls: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.id = id;
  e.className = cls;
  return e;
}

function append(parent: HTMLElement, ...children: (HTMLElement | null)[]): void {
  children.forEach(c => c && parent.appendChild(c));
}

// ── DomRuntime ────────────────────────────────────────────────────────────────

export class DomRuntime {
  readonly store: StateStore;
  private ev: ExpressionEvaluator;

  private nodeMap      = new Map<string, ElementDecl>();
  private childrenMap  = new Map<string, string[]>();
  private behaviorsMap = new Map<string, Behavior[]>();
  private domMap       = new Map<string, HTMLElement>(); // id → live DOM element
  private actions      = new Map<string, () => void>();
  private updating     = new Set<string>();

  private windowId     = '';
  windowTitle          = 'GateSyntaxWebb';
  private ready        = false;

  constructor(nodes: SyntaxNode[], store: StateStore) {
    this.store = store;
    this.ev    = new ExpressionEvaluator(store);

    for (const n of nodes) {
      if (n.kind !== 'element') continue;
      this.nodeMap.set(n.id, n);
      this.behaviorsMap.set(n.id, [...n.behaviors]);

      if (n.noun === 'WINDOW') {
        this.windowId = n.id;
        const tp = n.props.find(p => p.key === 'TITLE');
        if (tp && !collectRefs(tp.value).length)
          this.windowTitle = ExpressionEvaluator.toStr(this.ev.evaluate(tp.value));
        continue;
      }

      const ip = n.props.find(p => p.key === 'IN');
      if (ip?.value.kind === 'ref') {
        const pid = (ip.value as RefExpr).varName;
        this.childrenMap.set(pid, [...(this.childrenMap.get(pid) ?? []), n.id]);
      }
    }

    this.registerActions();
    this.ready = true;
    // LOAD behaviors
    for (const [, bs] of this.behaviorsMap)
      for (const b of bs) if (b.event === 'LOAD') this.dispatch(b, null);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Build the root HTMLElement (call once, append to the page). */
  buildRoot(): HTMLElement {
    const root = el('div', '__gs_root__', 'gs-app');
    for (const id of this.childrenMap.get(this.windowId) ?? []) {
      const c = this.build(id);
      if (c) root.appendChild(c);
    }
    return root;
  }

  /** Wire all live [VAR] bindings (call after buildRoot is in the DOM). */
  wireBindings(): void {
    for (const [nodeId, node] of this.nodeMap) {
      for (const p of node.props) {
        const refs = collectRefs(p.value);
        if (!refs.length) continue;
        this.bindProp(nodeId, p.key, p.value, refs);
      }
    }
  }

  handleEvent(widgetId: string, event: string, value: unknown = null): void {
    if (!this.ready || this.updating.has(widgetId)) return;
    for (const b of this.behaviorsMap.get(widgetId) ?? [])
      if (b.event === event) this.dispatch(b, value);
  }

  // ── Widget builder ──────────────────────────────────────────────────────────

  private build(id: string): HTMLElement | null {
    const node = this.nodeMap.get(id);
    if (!node) return null;
    const kids = this.childrenMap.get(id) ?? [];

    let domEl: HTMLElement | null;
    switch (node.noun) {
      case 'TABS': domEl = this.buildTabs(node, kids); break;
      case 'LIST': domEl = this.buildList(node, kids); break;
      case 'TAB':
      case 'ITEM': return null; // consumed by TABS / LIST
      default:     domEl = this.buildWidget(node, kids); break;
    }
    return domEl;
  }

  private kids(ids: string[]): HTMLElement[] {
    return ids.flatMap(id => { const e = this.build(id); return e ? [e] : []; });
  }

  private buildWidget(node: ElementDecl, childIds: string[]): HTMLElement {
    const children = this.kids(childIds);
    const domEl    = this.makeElement(node, children);
    this.applyStatic(domEl, node);
    this.domMap.set(node.id, domEl);
    return domEl;
  }

  // ── Element factory ─────────────────────────────────────────────────────────

  private makeElement(node: ElementDecl, children: HTMLElement[]): HTMLElement {
    const { noun, id } = node;
    const label = this.sStr(node, 'LABEL') ?? this.sStr(node, 'TEXT') ?? '';

    const box = (tag: keyof HTMLElementTagNameMap, cls: string): HTMLElement => {
      const e = el(tag as 'div', id, cls);
      children.forEach(c => e.appendChild(c));
      return e;
    };

    switch (noun) {
      // ── Containers ───────────────────────────────────────────────────────
      case 'COL': case 'STACK': return box('div', 'gs-col');
      case 'ROW':               return box('div', 'gs-row');
      case 'SCROLL':            return box('div', 'gs-scroll');

      case 'GRID': case 'UNIFORMGRID': {
        const cols = Number(this.sNum(node, 'COLS') ?? 3);
        const g = el('div', id, 'gs-grid');
        g.style.gridTemplateColumns = `repeat(${cols},1fr)`;
        children.forEach(c => g.appendChild(c));
        return g;
      }

      case 'PANEL': {
        const fs = el('fieldset', id, 'gs-panel') as unknown as HTMLElement;
        if (label) {
          const lg = document.createElement('legend');
          lg.className = 'gs-panel-title';
          lg.textContent = label;
          fs.appendChild(lg);
        }
        children.forEach(c => fs.appendChild(c));
        return fs;
      }

      // ── Text ─────────────────────────────────────────────────────────────
      case 'LABEL': {
        const sp = el('span', id, 'gs-label');
        const tp = node.props.find(p => p.key === 'TEXT' || p.key === 'LABEL');
        sp.textContent = tp ? ExpressionEvaluator.toStr(this.ev.evaluate(tp.value)) : '';
        return sp;
      }

      // ── Interactive ───────────────────────────────────────────────────────
      case 'BUTTON': {
        const btn = el('button', id, 'gs-button');
        btn.textContent = label || 'Button';
        btn.addEventListener('click', () => this.handleEvent(id, 'CLICK'));
        return btn;
      }

      case 'INPUT': {
        const inp = el('input', id, 'gs-input') as HTMLInputElement;
        inp.type = 'text';
        inp.placeholder = this.sStr(node, 'HINT') ?? '';
        inp.addEventListener('input', () => this.handleEvent(id, 'CHANGE', inp.value));
        return inp as unknown as HTMLElement;
      }

      case 'CHECK': {
        const wrap = el('label', id, 'gs-checkbox');
        const cb   = document.createElement('input');
        cb.type    = 'checkbox';
        cb.className = 'gs-check-input';
        const sp2  = document.createElement('span');
        sp2.className = 'gs-check-label';
        sp2.textContent = label;
        append(wrap, cb, sp2);
        cb.addEventListener('change', () => this.handleEvent(id, 'CHANGE', cb.checked));
        return wrap;
      }

      case 'TOGGLE': {
        const tog = el('label', id, 'gs-toggle');
        tog.innerHTML =
          `<input type="checkbox" class="gs-toggle-input">` +
          `<span class="gs-toggle-track"><span class="gs-toggle-thumb"></span></span>`;
        const ti = tog.querySelector<HTMLInputElement>('.gs-toggle-input')!;
        ti.addEventListener('change', () => this.handleEvent(id, 'CHANGE', ti.checked));
        return tog;
      }

      case 'TEXTAREA': {
        const ta = el('textarea', id, 'gs-textarea') as unknown as HTMLTextAreaElement;
        ta.addEventListener('input', () => this.handleEvent(id, 'CHANGE', ta.value));
        return ta as unknown as HTMLElement;
      }

      // ── Value displays ────────────────────────────────────────────────────
      case 'PROGRESS': {
        const max = Number(this.sNum(node, 'MAX') ?? 100);
        const pb  = el('div', id, 'gs-progress');
        pb.dataset.max = String(max);
        pb.innerHTML   =
          `<div class="gs-progress-fill" style="width:0%"></div>` +
          `<div class="gs-progress-label">0%</div>`;
        return pb;
      }

      case 'SLIDER': {
        const mn  = Number(this.sNum(node, 'MIN') ?? 0);
        const mx  = Number(this.sNum(node, 'MAX') ?? 100);
        const ini = Number(this.sNum(node, 'VALUE') ?? mn);
        const sl  = el('input', id, 'gs-slider') as HTMLInputElement;
        sl.type   = 'range';
        sl.min    = String(mn);
        sl.max    = String(mx);
        sl.value  = String(ini);
        sl.addEventListener('input', () => this.handleEvent(id, 'CHANGE', Number(sl.value)));
        return sl as unknown as HTMLElement;
      }

      case 'GAUGE': {
        const gmax = Number(this.sNum(node, 'MAX') ?? 100);
        const glbl = this.sStr(node, 'GAUGELABEL') ?? this.sStr(node, 'LABEL') ?? '';
        const gcol = qcol(this.sStr(node, 'STROKE') ?? this.sStr(node, 'COLOR') ?? '#4499ff');
        const g    = el('div', id, 'gs-gauge');
        g.dataset.max = String(gmax);
        g.innerHTML   =
          (glbl ? `<div class="gs-gauge-label">${glbl}</div>` : '') +
          `<div class="gs-gauge-track">` +
            `<div class="gs-gauge-fill" style="width:0%;background:${gcol}"></div>` +
          `</div>` +
          `<div class="gs-gauge-text">0 / ${gmax}</div>`;
        return g;
      }

      case 'SEPARATOR': case 'RULE': {
        const hr = el('hr', id, 'gs-rule') as unknown as HTMLElement;
        return hr;
      }

      default: return box('div', `gs-unknown`);
    }
  }

  // ── TABS ───────────────────────────────────────────────────────────────────

  private buildTabs(node: ElementDecl, childIds: string[]): HTMLElement {
    const root = el('div', node.id, 'gs-tabs');
    const bar  = document.createElement('div');
    bar.className = 'gs-tab-bar';
    const body = document.createElement('div');
    body.className = 'gs-tab-body';

    let firstId = '';
    for (const tabId of childIds) {
      const tabNode = this.nodeMap.get(tabId);
      if (!tabNode || tabNode.noun !== 'TAB') continue;

      const tabLabel = this.sStr(tabNode, 'LABEL') ?? tabId;

      const btn = document.createElement('button');
      btn.className   = 'gs-tab-btn';
      btn.textContent = tabLabel;
      btn.dataset.pane = tabId;
      btn.addEventListener('click', () => this.activateTab(root, tabId));
      bar.appendChild(btn);

      const pane = el('div', tabId, 'gs-tab-pane');
      this.kids(this.childrenMap.get(tabId) ?? []).forEach(c => pane.appendChild(c));
      body.appendChild(pane);
      this.domMap.set(tabId, pane);

      if (!firstId) firstId = tabId;
    }

    append(root, bar, body);
    this.domMap.set(node.id, root);
    if (firstId) this.activateTab(root, firstId);
    return root;
  }

  private activateTab(tabs: HTMLElement, tabId: string): void {
    tabs.querySelectorAll('.gs-tab-pane').forEach(p => p.classList.remove('active'));
    tabs.querySelectorAll('.gs-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    tabs.querySelector<HTMLElement>(`.gs-tab-btn[data-pane="${tabId}"]`)?.classList.add('active');
  }

  // ── LIST ──────────────────────────────────────────────────────────────────

  private buildList(node: ElementDecl, childIds: string[]): HTMLElement {
    const { id } = node;
    const ul = el('ul', id, 'gs-list');
    const h  = this.sNum(node, 'HEIGHT');
    if (h) ul.style.maxHeight = `${Number(h) * 24}px`;

    for (const cid of childIds) {
      const itemNode = this.nodeMap.get(cid);
      if (!itemNode) continue;
      const li = el('li', cid, 'gs-list-item');
      li.textContent   = this.sStr(itemNode, 'LABEL') ?? cid;
      li.dataset.itemId = cid;
      li.addEventListener('click', () => {
        ul.querySelectorAll('.gs-list-item').forEach(i => i.classList.remove('selected'));
        li.classList.add('selected');
        this.handleEvent(id, 'CHANGE', cid);
      });
      ul.appendChild(li);
    }

    this.domMap.set(id, ul);
    return ul;
  }

  // ── Static prop helpers ───────────────────────────────────────────────────

  private sStr(node: ElementDecl, key: string): string | undefined {
    const p = node.props.find(q => q.key === key);
    if (!p || collectRefs(p.value).length) return undefined;
    return ExpressionEvaluator.toStr(this.ev.evaluate(p.value));
  }

  private sNum(node: ElementDecl, key: string): number | undefined {
    const p = node.props.find(q => q.key === key);
    if (!p || collectRefs(p.value).length) return undefined;
    const v = this.ev.evaluate(p.value);
    return typeof v === 'number' ? v : (parseFloat(String(v)) || undefined);
  }

  // ── Apply static props ────────────────────────────────────────────────────

  private readonly SKIP_KEYS = new Set([
    'IN','LABEL','TEXT','HINT','MIN','MAX','GAUGELABEL','STROKE','COLS','ROWS','VALUE',
  ]);

  private applyStatic(domEl: HTMLElement, node: ElementDecl): void {
    for (const p of node.props) {
      if (this.SKIP_KEYS.has(p.key)) continue;
      if (collectRefs(p.value).length) continue;
      this.applyProp(domEl, node.id, p.key, this.ev.evaluate(p.value));
    }
    // Apply static VALUE last (slider initial position etc.)
    const vp = node.props.find(p => p.key === 'VALUE' && !collectRefs(p.value).length);
    if (vp) this.setValue(domEl, this.ev.evaluate(vp.value));
  }

  private applyProp(domEl: HTMLElement, id: string, key: string, val: unknown): void {
    void id;
    switch (key) {
      case 'ENABLED':  (domEl as HTMLButtonElement).disabled = !ExpressionEvaluator.toBool(val); break;
      case 'VISIBLE':  domEl.style.display = ExpressionEvaluator.toBool(val) ? '' : 'none'; break;
      case 'HEIGHT':   domEl.style.height  = `${Number(val)}px`; break;
      case 'WIDTH':    domEl.style.width   = `${Number(val)}px`; break;
      case 'BG':       domEl.style.backgroundColor = qcol(String(val)); break;
      case 'COLOR': case 'FG': domEl.style.color = qcol(String(val)); break;
      case 'MARGIN':   domEl.style.margin  = String(val); break;
      case 'PADDING':  domEl.style.padding = String(val); break;
      case 'STYLE':
        String(val).split(' ').forEach(c => domEl.classList.add(STYLE_CLS[c] ?? c));
        break;
      case 'READONLY':
        if (domEl instanceof HTMLInputElement) domEl.readOnly = ExpressionEvaluator.toBool(val);
        break;
    }
  }

  // ── Value setters ─────────────────────────────────────────────────────────

  private setValue(domEl: HTMLElement, val: unknown): void {
    if (domEl instanceof HTMLInputElement) {
      if (domEl.type === 'range')     domEl.value   = String(ExpressionEvaluator.toDouble(val));
      else if (domEl.type === 'checkbox') domEl.checked = ExpressionEvaluator.toBool(val);
      else                            domEl.value   = ExpressionEvaluator.toStr(val);
    } else if (domEl instanceof HTMLTextAreaElement) {
      domEl.value = ExpressionEvaluator.toStr(val);
    } else if (domEl.classList.contains('gs-progress')) {
      this.setProgress(domEl, ExpressionEvaluator.toDouble(val));
    } else if (domEl.classList.contains('gs-gauge')) {
      this.setGauge(domEl, ExpressionEvaluator.toDouble(val));
    } else if (domEl.classList.contains('gs-checkbox') || domEl.classList.contains('gs-toggle')) {
      const cb = domEl.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (cb) cb.checked = ExpressionEvaluator.toBool(val);
    }
  }

  private setValueSafe(id: string, domEl: HTMLElement, val: unknown): void {
    this.updating.add(id);
    try { this.setValue(domEl, val); }
    finally { this.updating.delete(id); }
  }

  private setProgress(domEl: HTMLElement, v: number): void {
    const max = parseFloat(domEl.dataset.max ?? '100') || 100;
    const pct = Math.min(100, Math.max(0, (v / max) * 100));
    const fill = domEl.querySelector<HTMLElement>('.gs-progress-fill');
    const lbl  = domEl.querySelector<HTMLElement>('.gs-progress-label');
    if (fill) fill.style.width = `${pct}%`;
    if (lbl)  lbl.textContent  = `${Math.round(pct)}%`;
  }

  private setGauge(domEl: HTMLElement, v: number): void {
    const max  = parseFloat(domEl.dataset.max ?? '100') || 100;
    const pct  = Math.min(100, Math.max(0, (v / max) * 100));
    const fill = domEl.querySelector<HTMLElement>('.gs-gauge-fill');
    const txt  = domEl.querySelector<HTMLElement>('.gs-gauge-text');
    if (fill) fill.style.width = `${pct}%`;
    if (txt)  txt.textContent  = `${Math.round(v)} / ${Math.round(max)}`;
  }

  // ── Live bindings ─────────────────────────────────────────────────────────

  private bindProp(nodeId: string, key: string, expr: ValueExpr, refs: string[]): void {
    const apply = () => {
      const val = this.ev.evaluate(expr);

      if (nodeId === this.windowId) {
        if (key === 'TITLE') document.title = ExpressionEvaluator.toStr(val);
        return;
      }

      const domEl = this.domMap.get(nodeId);
      if (!domEl) return;
      this.applyLive(domEl, nodeId, key, val);
    };

    for (const r of refs) this.store.subscribe(r, apply);
    apply(); // prime with current value
  }

  private applyLive(domEl: HTMLElement, id: string, key: string, val: unknown): void {
    switch (key) {
      case 'TEXT': case 'LABEL':
        domEl.textContent = ExpressionEvaluator.toStr(val);
        break;
      case 'VALUE':
        this.setValueSafe(id, domEl, val);
        break;
      case 'ENABLED':
        (domEl as HTMLButtonElement).disabled = !ExpressionEvaluator.toBool(val);
        break;
      case 'VISIBLE':
        domEl.style.display = ExpressionEvaluator.toBool(val) ? '' : 'none';
        break;
    }
  }

  // ── Event dispatch ────────────────────────────────────────────────────────

  private dispatch(b: Behavior, elementValue: unknown): void {
    if (b.targetVar === '__noop__') return;

    let val: unknown;
    if (b.expression) {
      const refs = collectRefs(SyntaxParser.parseValueExpr(b.expression));
      val = refs.length && elementValue !== null && refs.every(r => this.nodeMap.has(r))
        ? elementValue
        : this.ev.evaluateString(b.expression);
    } else {
      val = elementValue ?? '';
    }

    const key = ExpressionEvaluator.toStr(val).toUpperCase();
    if (this.actions.has(key)) { this.actions.get(key)!(); return; }
    this.store.set(b.targetVar, val);
  }

  // ── Toast notifications ───────────────────────────────────────────────────

  private notify(msg: string, level = 'info'): void {
    let stack = document.querySelector<HTMLElement>('.gs-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'gs-toast-stack';
      document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = `gs-toast gs-toast-${level}`;
    toast.textContent = msg;
    toast.onclick = () => toast.remove();
    stack.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => toast.classList.add('gs-toast-show'));
    setTimeout(() => { toast.classList.remove('gs-toast-show'); setTimeout(() => toast.remove(), 300); }, 4000);
  }

  // ── Built-in actions ──────────────────────────────────────────────────────

  private registerActions(): void {
    const g = (k: string) => ExpressionEvaluator.toStr(this.store.get(k) || '');

    this.actions.set('MSG_INFO',    () => { this.notify(g('DIALOG_MSG') || 'Info',    'info');    this.store.set('DIALOG_MSG_RESULT', 'OK'); });
    this.actions.set('MSG_WARN',    () => { this.notify(g('DIALOG_MSG') || 'Warning', 'warn');    this.store.set('DIALOG_MSG_RESULT', 'OK'); });
    this.actions.set('MSG_ERROR',   () => { this.notify(g('DIALOG_MSG') || 'Error',   'error');   this.store.set('DIALOG_MSG_RESULT', 'OK'); });
    this.actions.set('MSG_CONFIRM', () => { this.notify(g('DIALOG_MSG') || 'Confirm?','confirm'); this.store.set('DIALOG_MSG_RESULT', 'True'); });

    this.actions.set('ASYNC_START', () => {
      this.store.set('ASYNC_STATUS', 'Running');
      let i = 0;
      const tick = setInterval(() => {
        this.store.set('ASYNC_PROGRESS', i);
        i += 5;
        if (i > 100) {
          clearInterval(tick);
          this.store.set('ASYNC_STATUS', 'Done');
          this.store.set('ASYNC_PROGRESS', 100);
        }
      }, 100);
    });

    this.actions.set('CLIP_COPY', () => {
      navigator.clipboard?.writeText(
        ExpressionEvaluator.toStr(this.store.get('CLIP_TEXT') || ''),
      ).catch(() => null);
      this.notify('Copied to clipboard', 'info');
    });
  }
}

// ── GateSyntaxApp ─────────────────────────────────────────────────────────────

export class GateSyntaxApp {
  constructor(private readonly runtime: DomRuntime) {}

  mount(selector = '#root'): void {
    const container = document.querySelector<HTMLElement>(selector);
    if (!container) throw new Error(`mount: no element for "${selector}"`);
    document.title = this.runtime.windowTitle;
    container.appendChild(this.runtime.buildRoot());
    this.runtime.wireBindings();
  }
}
