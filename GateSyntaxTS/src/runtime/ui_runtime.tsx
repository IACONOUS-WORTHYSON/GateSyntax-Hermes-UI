// UI runtime — React widget renderer for GateSyntax .ui files
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { ElementDecl, SyntaxNode, StateDecl, Behavior, ValueExpr } from './syntax_node';
import { SyntaxParser } from './syntax_parser';
import { StateStore } from './state_store';
import { ExpressionEvaluator } from './expression_evaluator';
import { collectRefs } from './live_binding';

// ── Colour map (Rich names → CSS) ────────────────────────────────────────────

const RICH_COLORS: Record<string, string> = {
  bright_blue:    '#4499ff', bright_red:     '#ff5555',
  bright_yellow:  '#ffd740', bright_green:   '#55ee55',
  bright_cyan:    '#55eeee', bright_magenta: '#ee55ee',
  bright_white:   '#ffffff', blue:   '#3366cc', red:     '#cc3333',
  yellow: '#ccaa00',         green:  '#33aa33', cyan:    '#33aaaa',
  magenta:'#aa33aa',         white:  '#cccccc', dim:     '#777777',
};
function qcolor(c: string): string { return RICH_COLORS[c.trim().toLowerCase()] ?? c; }

// ── Style helpers ─────────────────────────────────────────────────────────────

const STYLE_CLASSES: Record<string, string> = {
  h1: 'gs-h1', h2: 'gs-h2', muted: 'gs-muted',
};

function nodeClasses(node: ElementDecl, base: string): string {
  const extra = node.props
    .filter(p => p.key === 'STYLE')
    .flatMap(p => String((p.value as { value?: unknown }).value ?? '').split(' '))
    .map(c => STYLE_CLASSES[c] ?? c)
    .join(' ');
  return [base, extra].filter(Boolean).join(' ');
}

function nodeStyle(node: ElementDecl, ev: ExpressionEvaluator): React.CSSProperties {
  const css: React.CSSProperties = {};
  for (const p of node.props) {
    if (collectRefs(p.value).length) continue;
    const v = ev.evaluate(p.value);
    switch (p.key) {
      case 'WIDTH':  css.width    = Number(v); break;
      case 'HEIGHT': css.height   = typeof v === 'number' && v < 50 ? v * 22 : Number(v); break;
      case 'BG':     css.backgroundColor = qcolor(String(v)); break;
      case 'COLOR': case 'FG': css.color = qcolor(String(v)); break;
      case 'MARGIN':  css.margin  = String(v); break;
      case 'PADDING': css.padding = String(v); break;
    }
  }
  return css;
}

// ── Context ───────────────────────────────────────────────────────────────────

export const GateSyntaxContext = createContext<UIRuntime | null>(null);

export function useRuntime(): UIRuntime {
  const rt = useContext(GateSyntaxContext);
  if (!rt) throw new Error('useRuntime must be used inside GateSyntaxContext');
  return rt;
}

// ── Reactive expression hook ──────────────────────────────────────────────────

function useExprValue(expr: ValueExpr | undefined, def: unknown = ''): unknown {
  const rt = useRuntime();
  const refs = useMemo(() => (expr ? collectRefs(expr) : []), [expr]);
  const evaluate = useCallback(
    () => (expr ? rt.evaluator.evaluate(expr) : def),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [value, setValue] = useState(evaluate);

  useEffect(() => {
    if (!refs.length) return;
    const unsubs = refs.map(r => rt.store.subscribe(r, () => setValue(evaluate())));
    return () => unsubs.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

// ── Individual widget components ──────────────────────────────────────────────

function GsCol({ node, childIds }: { node: ElementDecl; childIds: string[] }) {
  const rt = useRuntime();
  return (
    <div id={node.id} className={nodeClasses(node, 'gs-col')} style={nodeStyle(node, rt.evaluator)}>
      {childIds.map(id => <GsWidget key={id} nodeId={id} />)}
    </div>
  );
}

function GsRow({ node, childIds }: { node: ElementDecl; childIds: string[] }) {
  const rt = useRuntime();
  return (
    <div id={node.id} className={nodeClasses(node, 'gs-row')} style={nodeStyle(node, rt.evaluator)}>
      {childIds.map(id => <GsWidget key={id} nodeId={id} />)}
    </div>
  );
}

function GsGrid({ node, childIds }: { node: ElementDecl; childIds: string[] }) {
  const rt = useRuntime();
  const cols = Number(rt.getStaticProp(node, 'COLS') ?? 3);
  return (
    <div
      id={node.id}
      className={nodeClasses(node, 'gs-grid')}
      style={{ ...nodeStyle(node, rt.evaluator), gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {childIds.map(id => <GsWidget key={id} nodeId={id} />)}
    </div>
  );
}

function GsPanel({ node, childIds }: { node: ElementDecl; childIds: string[] }) {
  const rt = useRuntime();
  const title = rt.getStaticProp(node, 'LABEL') ?? '';
  return (
    <fieldset id={node.id} className={nodeClasses(node, 'gs-panel')} style={nodeStyle(node, rt.evaluator)}>
      {title && <legend className="gs-panel-title">{String(title)}</legend>}
      {childIds.map(id => <GsWidget key={id} nodeId={id} />)}
    </fieldset>
  );
}

function GsScroll({ node, childIds }: { node: ElementDecl; childIds: string[] }) {
  const rt = useRuntime();
  return (
    <div id={node.id} className={nodeClasses(node, 'gs-scroll')} style={nodeStyle(node, rt.evaluator)}>
      {childIds.map(id => <GsWidget key={id} nodeId={id} />)}
    </div>
  );
}

function GsTabs({ node, childIds }: { node: ElementDecl; childIds: string[] }) {
  const rt = useRuntime();
  const [active, setActive] = useState(childIds[0] ?? '');
  return (
    <div id={node.id} className="gs-tabs">
      <div className="gs-tab-bar">
        {childIds.map(tabId => {
          const tabNode = rt.getNode(tabId);
          if (!tabNode) return null;
          const label = String(rt.getStaticProp(tabNode, 'LABEL') ?? tabId);
          return (
            <button
              key={tabId}
              className={`gs-tab-btn${active === tabId ? ' active' : ''}`}
              onClick={() => setActive(tabId)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="gs-tab-body">
        {childIds.map(tabId => {
          const tabChildIds = rt.getChildren(tabId);
          return (
            <div key={tabId} id={tabId} className={`gs-tab-pane${active === tabId ? ' active' : ''}`}>
              {tabChildIds.map(id => <GsWidget key={id} nodeId={id} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GsList({ node, childIds }: { node: ElementDecl; childIds: string[] }) {
  const rt = useRuntime();
  const [selected, setSelected] = useState('');
  const handleSelect = useCallback((itemId: string) => {
    setSelected(itemId);
    rt.handleEvent(node.id, 'CHANGE', itemId);
  }, [rt, node.id]);
  const heightPx = Number(rt.getStaticProp(node, 'HEIGHT') ?? 0);
  return (
    <ul
      id={node.id}
      className={nodeClasses(node, 'gs-list')}
      style={heightPx ? { maxHeight: heightPx * 22 } : undefined}
    >
      {childIds.map(cid => {
        const item = rt.getNode(cid);
        if (!item) return null;
        const label = String(rt.getStaticProp(item, 'LABEL') ?? cid);
        return (
          <li
            key={cid}
            id={cid}
            className={`gs-list-item${selected === cid ? ' selected' : ''}`}
            onClick={() => handleSelect(cid)}
          >
            {label}
          </li>
        );
      })}
    </ul>
  );
}

function GsLabel({ node }: { node: ElementDecl }) {
  const rt = useRuntime();
  const textProp = node.props.find(p => p.key === 'TEXT' || p.key === 'LABEL');
  const text = useExprValue(textProp?.value, '');
  const visible = useLiveBool(node, 'VISIBLE', true);
  return (
    <span
      id={node.id}
      className={nodeClasses(node, 'gs-label')}
      style={{ ...nodeStyle(node, rt.evaluator), display: visible ? '' : 'none' }}
    >
      {ExpressionEvaluator.toStr(text)}
    </span>
  );
}

function GsButton({ node }: { node: ElementDecl }) {
  const rt = useRuntime();
  const labelProp = node.props.find(p => p.key === 'LABEL' || p.key === 'TEXT');
  const label = labelProp ? ExpressionEvaluator.toStr(rt.evaluator.evaluate(labelProp.value)) : 'Button';
  const enabled = useLiveBool(node, 'ENABLED', true);
  const handleClick = useCallback(() => rt.handleEvent(node.id, 'CLICK'), [rt, node.id]);
  return (
    <button
      id={node.id}
      className={nodeClasses(node, 'gs-button')}
      style={nodeStyle(node, rt.evaluator)}
      disabled={!enabled}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

function GsInput({ node }: { node: ElementDecl }) {
  const rt = useRuntime();
  const hint = String(rt.getStaticProp(node, 'HINT') ?? '');
  const valueProp = node.props.find(p => p.key === 'VALUE');
  const storeVal  = String(useExprValue(valueProp?.value, '') ?? '');
  const [local, setLocal] = useState(storeVal);
  const storeRef  = useRef(storeVal);

  useEffect(() => {
    if (storeVal !== storeRef.current) { storeRef.current = storeVal; setLocal(storeVal); }
  }, [storeVal]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocal(e.target.value);
    rt.handleEvent(node.id, 'CHANGE', e.target.value);
  }, [rt, node.id]);

  return (
    <input
      type="text"
      id={node.id}
      className={nodeClasses(node, 'gs-input')}
      style={nodeStyle(node, rt.evaluator)}
      placeholder={hint}
      value={local}
      onChange={handleChange}
    />
  );
}

function GsCheck({ node }: { node: ElementDecl }) {
  const rt = useRuntime();
  const label     = String(rt.getStaticProp(node, 'LABEL') ?? '');
  const valueProp = node.props.find(p => p.key === 'VALUE');
  const checked   = ExpressionEvaluator.toBool(useExprValue(valueProp?.value, false));
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    rt.handleEvent(node.id, 'CHANGE', e.target.checked);
  }, [rt, node.id]);
  return (
    <label id={node.id} className={nodeClasses(node, 'gs-checkbox')} style={nodeStyle(node, rt.evaluator)}>
      <input type="checkbox" className="gs-check-input" checked={checked} onChange={handleChange} />
      <span className="gs-check-label">{label}</span>
    </label>
  );
}

function GsToggle({ node }: { node: ElementDecl }) {
  const rt = useRuntime();
  const valueProp = node.props.find(p => p.key === 'VALUE');
  const checked   = ExpressionEvaluator.toBool(useExprValue(valueProp?.value, false));
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    rt.handleEvent(node.id, 'CHANGE', e.target.checked);
  }, [rt, node.id]);
  return (
    <label id={node.id} className={nodeClasses(node, 'gs-toggle')} style={nodeStyle(node, rt.evaluator)}>
      <input type="checkbox" className="gs-toggle-input" checked={checked} onChange={handleChange} />
      <span className="gs-toggle-track"><span className="gs-toggle-thumb" /></span>
    </label>
  );
}

function GsProgress({ node }: { node: ElementDecl }) {
  const rt  = useRuntime();
  const max = ExpressionEvaluator.toDouble(rt.getStaticProp(node, 'MAX') ?? 100);
  const valueProp = node.props.find(p => p.key === 'VALUE');
  const value = ExpressionEvaluator.toDouble(useExprValue(valueProp?.value, 0));
  const pct   = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div id={node.id} className={nodeClasses(node, 'gs-progress')} style={nodeStyle(node, rt.evaluator)}>
      <div className="gs-progress-fill" style={{ width: `${pct}%` }} />
      <div className="gs-progress-label">{Math.round(pct)}%</div>
    </div>
  );
}

function GsSlider({ node }: { node: ElementDecl }) {
  const rt  = useRuntime();
  const min = ExpressionEvaluator.toDouble(rt.getStaticProp(node, 'MIN') ?? 0);
  const max = ExpressionEvaluator.toDouble(rt.getStaticProp(node, 'MAX') ?? 100);
  const valueProp = node.props.find(p => p.key === 'VALUE');
  const value = ExpressionEvaluator.toDouble(useExprValue(valueProp?.value, min));
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    rt.handleEvent(node.id, 'CHANGE', Number(e.target.value));
  }, [rt, node.id]);
  return (
    <input
      type="range"
      id={node.id}
      className={nodeClasses(node, 'gs-slider')}
      style={nodeStyle(node, rt.evaluator)}
      min={min} max={max} value={value}
      onChange={handleChange}
    />
  );
}

function GsGauge({ node }: { node: ElementDecl }) {
  const rt    = useRuntime();
  const max   = ExpressionEvaluator.toDouble(rt.getStaticProp(node, 'MAX') ?? 100);
  const lbl   = String(rt.getStaticProp(node, 'GAUGELABEL') ?? rt.getStaticProp(node, 'LABEL') ?? '');
  const color = qcolor(String(rt.getStaticProp(node, 'STROKE') ?? rt.getStaticProp(node, 'COLOR') ?? '#4499ff'));
  const valueProp = node.props.find(p => p.key === 'VALUE');
  const value = ExpressionEvaluator.toDouble(useExprValue(valueProp?.value, 0));
  const pct   = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div id={node.id} className={nodeClasses(node, 'gs-gauge')} style={nodeStyle(node, rt.evaluator)}>
      {lbl && <div className="gs-gauge-label">{lbl}</div>}
      <div className="gs-gauge-track">
        <div className="gs-gauge-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="gs-gauge-text">{Math.round(value)} / {Math.round(max)}</div>
    </div>
  );
}

function GsRule({ node }: { node: ElementDecl }) {
  return <hr id={node.id} className={nodeClasses(node, 'gs-rule')} />;
}

function GsTextArea({ node }: { node: ElementDecl }) {
  const rt = useRuntime();
  const valueProp = node.props.find(p => p.key === 'VALUE');
  const value = String(useExprValue(valueProp?.value, '') ?? '');
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    rt.handleEvent(node.id, 'CHANGE', e.target.value);
  }, [rt, node.id]);
  return (
    <textarea
      id={node.id}
      className={nodeClasses(node, 'gs-textarea')}
      style={nodeStyle(node, rt.evaluator)}
      value={value}
      onChange={handleChange}
    />
  );
}

// Helper hook for a boolean live prop (ENABLED, VISIBLE, etc.)
function useLiveBool(node: ElementDecl, key: string, def: boolean): boolean {
  const prop = node.props.find(p => p.key === key);
  const val  = useExprValue(prop?.value, def);
  return ExpressionEvaluator.toBool(val ?? def);
}

// ── Main widget dispatcher ────────────────────────────────────────────────────

export function GsWidget({ nodeId }: { nodeId: string }) {
  const rt       = useRuntime();
  const node     = rt.getNode(nodeId);
  if (!node) return null;
  const childIds = rt.getChildren(nodeId);

  switch (node.noun) {
    case 'COL': case 'STACK': return <GsCol   node={node} childIds={childIds} />;
    case 'ROW':               return <GsRow   node={node} childIds={childIds} />;
    case 'GRID': case 'UNIFORMGRID': return <GsGrid  node={node} childIds={childIds} />;
    case 'PANEL':             return <GsPanel  node={node} childIds={childIds} />;
    case 'SCROLL':            return <GsScroll node={node} childIds={childIds} />;
    case 'TABS':              return <GsTabs   node={node} childIds={childIds} />;
    case 'LIST':              return <GsList   node={node} childIds={childIds} />;
    case 'LABEL':             return <GsLabel  node={node} />;
    case 'BUTTON':            return <GsButton node={node} />;
    case 'INPUT':             return <GsInput  node={node} />;
    case 'CHECK':             return <GsCheck  node={node} />;
    case 'TOGGLE':            return <GsToggle node={node} />;
    case 'PROGRESS':          return <GsProgress node={node} />;
    case 'SLIDER':            return <GsSlider   node={node} />;
    case 'GAUGE':             return <GsGauge    node={node} />;
    case 'SEPARATOR': case 'RULE': return <GsRule node={node} />;
    case 'TEXTAREA':          return <GsTextArea  node={node} />;
    case 'TAB': case 'ITEM':  return null; // consumed by parent
    default:
      return (
        <div id={node.id} className="gs-unknown">
          {childIds.map(id => <GsWidget key={id} nodeId={id} />)}
        </div>
      );
  }
}

// ── UIRuntime class ───────────────────────────────────────────────────────────

export class UIRuntime {
  readonly store:     StateStore;
  readonly evaluator: ExpressionEvaluator;

  private nodeMap      = new Map<string, ElementDecl>();
  private childrenMap  = new Map<string, string[]>();
  private behaviorsMap = new Map<string, Behavior[]>();
  private actions      = new Map<string, () => void>();
  private windowId     = '';
  private _ready       = false;

  windowTitle = 'GateSyntaxTS';
  notifyFn: ((msg: string, level?: string) => void) | null = null;

  constructor(nodes: SyntaxNode[], store: StateStore) {
    this.store     = store;
    this.evaluator = new ExpressionEvaluator(store);

    for (const n of nodes) {
      if (n.kind !== 'element') continue;
      this.nodeMap.set(n.id, n);
      this.behaviorsMap.set(n.id, [...n.behaviors]);

      if (n.noun === 'WINDOW') {
        this.windowId = n.id;
        const titleProp = n.props.find(p => p.key === 'TITLE');
        if (titleProp && !collectRefs(titleProp.value).length)
          this.windowTitle = ExpressionEvaluator.toStr(this.evaluator.evaluate(titleProp.value));
        continue;
      }

      const inProp = n.props.find(p => p.key === 'IN');
      if (inProp?.value.kind === 'ref') {
        const pid = inProp.value.varName;
        if (!this.childrenMap.has(pid)) this.childrenMap.set(pid, []);
        this.childrenMap.get(pid)!.push(n.id);
      }
    }

    this.registerBuiltinActions();
    this._ready = true;

    // Fire LOAD behaviors
    for (const [wid, behaviors] of this.behaviorsMap) {
      for (const b of behaviors) {
        if (b.event === 'LOAD') this.dispatchBehavior(wid, b, null);
      }
    }
  }

  getNode(id: string): ElementDecl | undefined { return this.nodeMap.get(id); }
  getChildren(id: string): string[] { return this.childrenMap.get(id) ?? []; }
  getWindowChildren(): string[] { return this.childrenMap.get(this.windowId) ?? []; }

  getStaticProp(node: ElementDecl, key: string): unknown {
    const p = node.props.find(q => q.key === key);
    if (!p || collectRefs(p.value).length) return undefined;
    return this.evaluator.evaluate(p.value);
  }

  handleEvent(widgetId: string, event: string, value: unknown = null): void {
    if (!this._ready) return;
    const behaviors = this.behaviorsMap.get(widgetId) ?? [];
    for (const b of behaviors) {
      if (b.event === event) this.dispatchBehavior(widgetId, b, value);
    }
  }

  private dispatchBehavior(widgetId: string, b: Behavior, elementValue: unknown): void {
    void widgetId;
    if (b.targetVar === '__noop__') return;

    let val: unknown;
    if (b.expression) {
      const refs = collectRefs(SyntaxParser.parseValueExpr(b.expression));
      val = (refs.length && elementValue !== null && refs.every(r => this.nodeMap.has(r)))
        ? elementValue
        : this.evaluator.evaluateString(b.expression);
    } else {
      val = elementValue ?? '';
    }

    const valStr = ExpressionEvaluator.toStr(val).toUpperCase();
    if (this.actions.has(valStr)) { this.actions.get(valStr)!(); return; }
    this.store.set(b.targetVar, val);
  }

  private notify(msg: string, level = 'info'): void {
    this.notifyFn?.(msg, level);
  }

  private registerBuiltinActions(): void {
    this.actions.set('MSG_INFO', () => {
      const msg = ExpressionEvaluator.toStr(this.store.get('DIALOG_MSG') || 'Info');
      this.notify(msg, 'info');
      this.store.set('DIALOG_MSG_RESULT', 'OK');
    });
    this.actions.set('MSG_WARN', () => {
      const msg = ExpressionEvaluator.toStr(this.store.get('DIALOG_MSG') || 'Warning');
      this.notify(msg, 'warn');
      this.store.set('DIALOG_MSG_RESULT', 'OK');
    });
    this.actions.set('MSG_ERROR', () => {
      const msg = ExpressionEvaluator.toStr(this.store.get('DIALOG_MSG') || 'Error');
      this.notify(msg, 'error');
      this.store.set('DIALOG_MSG_RESULT', 'OK');
    });
    this.actions.set('MSG_CONFIRM', () => {
      const msg = ExpressionEvaluator.toStr(this.store.get('DIALOG_MSG') || 'Confirm?');
      this.notify(msg, 'confirm');
      this.store.set('DIALOG_MSG_RESULT', 'True');
    });
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
      const text = ExpressionEvaluator.toStr(this.store.get('CLIP_TEXT') || '');
      navigator.clipboard?.writeText(text).catch(() => null);
      this.notify('Copied to clipboard', 'info');
    });
  }
}
