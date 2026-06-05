using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;

namespace GateSyntax.Runtime;

public sealed class StateStore : INotifyPropertyChanged
{
    private readonly ConcurrentDictionary<string, object> _values = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, List<Action<object>>> _subscribers = new(StringComparer.OrdinalIgnoreCase);

    public event PropertyChangedEventHandler? PropertyChanged;

    public void Set(string name, object value)
    {
        _values[name] = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        if (_subscribers.TryGetValue(name, out var list))
            foreach (var cb in list) cb(value);
    }

    public object Get(string name) =>
        _values.TryGetValue(name, out var v) ? v : "";

    public void SetDefault(string name, object value)
    {
        _values.TryAdd(name, value);
    }

    public void Restore(Dictionary<string, object> saved)
    {
        foreach (var (k, v) in saved)
            _values[k] = v;
    }

    public Dictionary<string, object> Snapshot(IEnumerable<string> names)
    {
        var d = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        foreach (var n in names)
            if (_values.TryGetValue(n, out var v)) d[n] = v;
        return d;
    }

    public void Subscribe(string name, Action<object> callback)
    {
        _subscribers.AddOrUpdate(name,
            _ => [callback],
            (_, list) => { lock (list) list.Add(callback); return list; });
    }
}
