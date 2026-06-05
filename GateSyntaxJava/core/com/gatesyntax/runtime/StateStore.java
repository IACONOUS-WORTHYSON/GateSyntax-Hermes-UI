package com.gatesyntax.runtime;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/** Reactive state store — mirrors GateSyntax.Runtime.StateStore. */
public class StateStore {

    private final Map<String, Object>            data      = new ConcurrentHashMap<>();
    private final Map<String, List<Consumer<Object>>> subs = new ConcurrentHashMap<>();

    public void set(String name, Object value) {
        String key = name.toUpperCase();
        Object old = data.get(key);
        if (Objects.equals(old, value)) return;
        data.put(key, value);
        List<Consumer<Object>> listeners = subs.get(key);
        if (listeners != null) listeners.forEach(fn -> fn.accept(value));
    }

    public Object get(String name) {
        return data.getOrDefault(name.toUpperCase(), "");
    }

    public Object get(String name, Object defaultValue) {
        return data.getOrDefault(name.toUpperCase(), defaultValue);
    }

    public void setDefault(String name, Object value) {
        data.putIfAbsent(name.toUpperCase(), value);
    }

    public void subscribe(String name, Consumer<Object> listener) {
        subs.computeIfAbsent(name.toUpperCase(), k -> new CopyOnWriteArrayList<>()).add(listener);
    }

    public Map<String, Object> snapshot() {
        return Collections.unmodifiableMap(new HashMap<>(data));
    }
}
