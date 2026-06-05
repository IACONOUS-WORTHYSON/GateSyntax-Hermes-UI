// Reactive state store — mirrors GateSyntax.Runtime.StateStore.cs

type Listener = (value: unknown) => void;

export class StateStore {
  private data      = new Map<string, unknown>();
  private listeners = new Map<string, Set<Listener>>();

  set(name: string, value: unknown): void {
    const key = name.toUpperCase();
    if (this.data.get(key) === value) return;
    this.data.set(key, value);
    this.listeners.get(key)?.forEach(fn => fn(value));
  }

  get(name: string, defaultValue: unknown = ''): unknown {
    return this.data.has(name.toUpperCase())
      ? this.data.get(name.toUpperCase())
      : defaultValue;
  }

  setDefault(name: string, value: unknown): void {
    const key = name.toUpperCase();
    if (!this.data.has(key)) this.data.set(key, value);
  }

  /** Returns an unsubscribe function. */
  subscribe(name: string, fn: Listener): () => void {
    const key = name.toUpperCase();
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn);
    return () => this.listeners.get(key)?.delete(fn);
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }

  restore(saved: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(saved)) {
      this.data.set(k.toUpperCase(), v);
    }
  }
}
