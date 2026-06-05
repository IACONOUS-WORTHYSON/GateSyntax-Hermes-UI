using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace GateSyntax.Runtime;

public sealed class PersistenceService(StateStore store)
{
    private readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "GateSyntax", "state.json");

    private List<string> _savedNames = [];

    public void RegisterNodes(List<SyntaxNode> nodes)
    {
        _savedNames = nodes.OfType<StateDecl>()
                          .Where(s => s.Saved)
                          .Select(s => s.Name)
                          .ToList();
    }

    public void Restore()
    {
        if (!File.Exists(_path)) return;
        try
        {
            var json = File.ReadAllText(_path);
            var raw = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);
            if (raw == null) return;
            var d = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var (k, v) in raw)
            {
                object obj = v.ValueKind switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Number => v.TryGetInt32(out int i) ? (object)i : v.GetDouble(),
                    JsonValueKind.String => v.GetString() ?? "",
                    _ => v.ToString()
                };
                d[k] = obj;
            }
            store.Restore(d);
        }
        catch { /* corrupt file — start fresh */ }
    }

    public void Save()
    {
        if (_savedNames.Count == 0) return;
        try
        {
            var snap = store.Snapshot(_savedNames);
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(snap));
        }
        catch { }
    }
}
