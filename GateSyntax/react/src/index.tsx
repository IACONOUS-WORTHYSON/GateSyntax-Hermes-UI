/**
 * GateSyntax Integrador — React / TSX
 * Domain-agnostic live-binding layer for GateSyntaxTS (React runtime).
 *
 * Two ways to use it:
 *
 * 1. Component — drop <GateSyntaxIntegrador> next to any component:
 *
 *      function App() {
 *        const [state, setState] = useState({ speed: 50, label: 'Hi', on: true });
 *        return (
 *          <>
 *            <MyApp state={state} />
 *            <GateSyntaxIntegrador state={state} onChange={setState} />
 *          </>
 *        );
 *      }
 *
 * 2. Hook — useGateSyntaxIntegrador returns a live-synced state copy:
 *
 *      const [state, setState] = useGateSyntaxIntegrador({ speed: 50 });
 */

import React, {
  createContext, useCallback, useContext,
  useEffect, useMemo, useRef, useState,
} from 'react';

// ── Import GateSyntaxTS runtime ───────────────────────────────────────────────
// Resolved via peerDependency "@gatesyntax/ts" or a local path alias.
// In a Vite project add to vite.config.ts:
//   resolve: { alias: { "@gatesyntax/ts": "../../GateSyntaxTS/src" } }
import { GateSyntaxBuilder }                      from '@gatesyntax/ts/GateSyntaxBuilder';
import { GateSyntaxContext, GsWidget, UIRuntime }  from '@gatesyntax/ts/runtime/ui_runtime';
import { StateStore }                              from '@gatesyntax/ts/runtime/state_store';
import '@gatesyntax/ts/styles/theme.css';

// ── Type helpers ──────────────────────────────────────────────────────────────

type Primitive = string | number | boolean;
type StateShape = Record<string, Primitive | ((...args: unknown[]) => unknown)>;
type PlainState = Record<string, Primitive>;

type BindingMeta = {
  min?:   number;
  max?:   number;
  label?: string;
};

type IntegradorProps<T extends StateShape> = {
  state:         T;
  onChange?:     (next: Partial<T>) => void;
  meta?:         Partial<Record<keyof T, BindingMeta>>;
  title?:        string;
  pollHz?:       number;
  side?:         'left' | 'right';
  width?:        number | string;
  collapsible?:  boolean;
};

// ── .ui generation ────────────────────────────────────────────────────────────

function generateUi(state: StateShape, meta: Record<string, BindingMeta>, title: string): string {
  const lines: string[] = [
    `WINDOW Root :: TITLE "${title}"`,
    'SCROLL MainScroll :: IN [Root]',
    'COL    MainCol    :: IN [MainScroll]',
  ];

  for (const [key, val] of Object.entries(state)) {
    const v    = `GS_${key.toUpperCase()}`;
    const m    = meta[key] ?? {};
    const label = m.label ?? key;
    const min  = m.min ?? 0;
    const max  = m.max ?? 100;

    if (typeof val === 'function') {
      lines.push(
        `BUTTON ${key}Btn :: IN [MainCol]` +
        ` :: LABEL "▶  ${label}"` +
        ` :: ON CLICK /${v}_CALL :: "CALL_${key.toUpperCase()}"\\`,
      );
    } else if (typeof val === 'number') {
      lines.push(
        `/${v} :: ${val}\\`,
        `LABEL  ${key}Lbl :: IN [MainCol] :: TEXT "${label}:  " + [${v}]`,
        `SLIDER ${key}Sl  :: IN [MainCol]` +
          ` :: MIN ${min} :: MAX ${max}` +
          ` :: VALUE [${v}]` +
          ` :: ON CHANGE /${v} :: [${key}Sl]\\`,
        `RULE ${key}Sep :: IN [MainCol]`,
      );
    } else if (typeof val === 'boolean') {
      lines.push(
        `/${v} :: ${val ? 'TRUE' : 'FALSE'}\\`,
        `TOGGLE ${key}Tog :: IN [MainCol]` +
          ` :: LABEL "${label}"` +
          ` :: VALUE [${v}]` +
          ` :: ON CHANGE /${v} :: [${key}Tog]\\`,
      );
    } else {
      lines.push(
        `/${v} :: "${String(val)}"\\`,
        `LABEL ${key}Lbl :: IN [MainCol] :: TEXT "${label}"`,
        `INPUT ${key}In  :: IN [MainCol]` +
          ` :: HINT "Enter ${label}…"` +
          ` :: ON CHANGE /${v} :: [${key}In]\\`,
      );
    }
  }

  return lines.join('\n');
}

// ── Inner panel (uses GateSyntax context) ─────────────────────────────────────

function IntegradorPanel<T extends StateShape>({
  state, onChange, meta, title, pollHz,
}: Required<Pick<IntegradorProps<T>, 'state' | 'meta' | 'title' | 'pollHz'>> & {
  onChange?: (next: Partial<T>) => void;
}) {
  const uiContent = useMemo(
    () => generateUi(state, meta as Record<string, BindingMeta>, title),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],   // generate once; live sync handled via store
  );

  const [runtime, setRuntime] = useState<UIRuntime | null>(null);
  const rtRef    = useRef<UIRuntime | null>(null);
  const prevRef  = useRef<PlainState>({});

  // Build runtime once
  useEffect(() => {
    const rt = GateSyntaxBuilder
      .fromContents([{ content: uiContent, name: 'integrador.ui' }])
      .build() as unknown as UIRuntime;           // GateSyntaxApp wraps UIRuntime

    // Seed initial state
    for (const [key, val] of Object.entries(state)) {
      if (typeof val !== 'function') {
        rt.store.set(`GS_${key.toUpperCase()}`, val as unknown);
      }
    }

    // UI → host: state changes propagate up via onChange
    for (const key of Object.keys(state)) {
      if (typeof state[key] === 'function') {
        // Register action callbacks
        const callVar = `GS_${key.toUpperCase()}_CALL`;
        rt.store.subscribe(callVar, () => {
          const fn = state[key];
          if (typeof fn === 'function') {
            try { (fn as () => void)(); } catch { /* skip */ }
          }
        });
      } else {
        rt.store.subscribe(`GS_${key.toUpperCase()}`, (v: unknown) => {
          onChange?.({ [key]: v } as Partial<T>);
        });
      }
    }

    rtRef.current = rt;
    setRuntime(rt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Host → UI: push external state changes into the store (live poll)
  useEffect(() => {
    const id = setInterval(() => {
      const rt = rtRef.current;
      if (!rt) return;
      for (const [key, val] of Object.entries(state)) {
        if (typeof val === 'function') continue;
        const prev = prevRef.current[key];
        if (prev !== val) {
          rt.store.set(`GS_${key.toUpperCase()}`, val as unknown);
          prevRef.current[key] = val as Primitive;
        }
      }
    }, 1000 / pollHz);
    return () => clearInterval(id);
  }, [state, pollHz]);

  if (!runtime) return <div className="gs-loading"><div className="gs-spinner" /></div>;

  return (
    <GateSyntaxContext.Provider value={runtime}>
      <div className="gs-app" style={{ height: '100%', overflow: 'auto' }}>
        {runtime.getWindowChildren().map(id => (
          <GsWidget key={id} nodeId={id} />
        ))}
      </div>
    </GateSyntaxContext.Provider>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GateSyntaxIntegrador<T extends StateShape>({
  state,
  onChange,
  meta        = {} as IntegradorProps<T>['meta'],
  title       = 'GateSyntax Integrador',
  pollHz      = 30,
  side        = 'right',
  width       = 300,
  collapsible = true,
}: IntegradorProps<T>) {
  const [open, setOpen] = useState(true);
  const resolvedMeta = (meta ?? {}) as Record<string, BindingMeta>;

  const panelStyle: React.CSSProperties = {
    position:   'fixed',
    top:        0,
    [side]:     0,
    width:      open ? (typeof width === 'number' ? `${width}px` : width) : 0,
    height:     '100vh',
    zIndex:     999998,
    overflow:   'hidden',
    boxShadow:  side === 'right'
                  ? '-4px 0 20px rgba(0,0,0,.5)'
                  : '4px 0 20px rgba(0,0,0,.5)',
    transition: 'width .2s ease',
    background: 'var(--bg, #1a1a2e)',
  };

  const toggleStyle: React.CSSProperties = {
    position:   'fixed',
    top:        8,
    [side]:     open
                  ? (typeof width === 'number' ? width + 8 : `calc(${width} + 8px)`)
                  : 8,
    zIndex:     999999,
    background: '#2e2e50',
    color:      '#e0e0e0',
    border:     '1px solid #44447a',
    borderRadius: '4px',
    padding:    '4px 10px',
    cursor:     'pointer',
    fontSize:   '12px',
    transition: `${side} .2s ease`,
  };

  return (
    <>
      {collapsible && (
        <button style={toggleStyle} onClick={() => setOpen(o => !o)}>
          {open ? '✕' : '⚙ GS'}
        </button>
      )}
      <div style={panelStyle}>
        {open && (
          <IntegradorPanel
            state={state}
            onChange={onChange}
            meta={resolvedMeta}
            title={title}
            pollHz={pollHz}
          />
        )}
      </div>
    </>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useGateSyntaxIntegrador<T> — manages state and returns both the current
 * value and a GateSyntax side-panel component bound to it.
 *
 * Usage:
 *   const [state, setState, Panel] = useGateSyntaxIntegrador({ speed: 50 });
 *   return <><MyApp state={state} /><Panel /></>;
 */
export function useGateSyntaxIntegrador<T extends PlainState>(
  initial:    T,
  opts:       Omit<IntegradorProps<T>, 'state' | 'onChange'> = {},
): [T, React.Dispatch<React.SetStateAction<T>>, React.FC] {
  const [state, setState] = useState<T>(initial);

  const handleChange = useCallback((patch: Partial<T>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  const Panel: React.FC = useCallback(
    () => (
      <GateSyntaxIntegrador<T>
        state={state}
        onChange={handleChange}
        {...opts}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );

  return [state, setState, Panel];
}

export default GateSyntaxIntegrador;
