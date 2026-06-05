import { useCallback, useEffect, useRef, useState } from 'react';
import { GateSyntaxBuilder } from './GateSyntaxBuilder';
import { GateSyntaxContext, GsWidget, UIRuntime, useRuntime } from './runtime/ui_runtime';
import './styles/theme.css';

// ── Notification toast ────────────────────────────────────────────────────────

interface Toast { id: number; msg: string; level: string; }

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="gs-toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`gs-toast gs-toast-${t.level}`} onClick={() => onDismiss(t.id)}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Window title sync ─────────────────────────────────────────────────────────

function WindowTitle() {
  const rt = useRuntime();
  useEffect(() => { document.title = rt.windowTitle; }, [rt.windowTitle]);
  return null;
}

// ── Root content (uses context) ───────────────────────────────────────────────

function AppContent() {
  const rt = useRuntime();
  return (
    <div className="gs-app">
      <WindowTitle />
      {rt.getWindowChildren().map(id => <GsWidget key={id} nodeId={id} />)}
    </div>
  );
}

// ── UI file list ──────────────────────────────────────────────────────────────

const UI_FILES = ['main.ui', 'controls.ui', 'binding.ui', 'commands.ui', 'data.ui'];

// ── Root app ──────────────────────────────────────────────────────────────────

export default function App() {
  const [runtime, setRuntime] = useState<UIRuntime | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [toasts, setToasts]   = useState<Toast[]>([]);
  const toastId = useRef(0);

  const pushToast = useCallback((msg: string, level = 'info') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, msg, level }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    Promise.all(UI_FILES.map(f => fetch(`/UI/${f}`).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${f}: ${r.status}`);
      return r.text().then(content => ({ content, name: f }));
    })))
      .then(sources => {
        const rt = GateSyntaxBuilder.fromContents(sources).build();
        rt.notifyFn = pushToast;
        setRuntime(rt);
      })
      .catch(err => setError(String(err)));
  }, [pushToast]);

  if (error) {
    return (
      <div className="gs-error">
        <h2>Failed to load UI</h2>
        <pre>{error}</pre>
      </div>
    );
  }

  if (!runtime) {
    return (
      <div className="gs-loading">
        <div className="gs-spinner" />
        <span>Loading GateSyntax…</span>
      </div>
    );
  }

  return (
    <GateSyntaxContext.Provider value={runtime}>
      <AppContent />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </GateSyntaxContext.Provider>
  );
}
