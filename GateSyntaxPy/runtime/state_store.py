"""Reactive state store — mirrors GateSyntax.Runtime.StateStore.cs"""
from __future__ import annotations
import threading
from typing import Any, Callable


class StateStore:
    def __init__(self) -> None:
        self._data: dict[str, Any] = {}
        self._subscribers: dict[str, list[Callable[[Any], None]]] = {}
        self._lock = threading.Lock()

    def set(self, name: str, value: Any) -> None:
        key = name.upper()
        with self._lock:
            if self._data.get(key) == value:
                return
            self._data[key] = value
            cbs = list(self._subscribers.get(key, []))
        for cb in cbs:
            cb(value)

    def get(self, name: str, default: Any = "") -> Any:
        return self._data.get(name.upper(), default)

    def set_default(self, name: str, value: Any) -> None:
        key = name.upper()
        with self._lock:
            if key not in self._data:
                self._data[key] = value

    def restore(self, saved: dict[str, Any]) -> None:
        with self._lock:
            for k, v in saved.items():
                self._data[k.upper()] = v

    def snapshot(self, names: list[str]) -> dict[str, Any]:
        with self._lock:
            return {n: self._data[n.upper()] for n in names if n.upper() in self._data}

    def subscribe(self, name: str, callback: Callable[[Any], None]) -> None:
        key = name.upper()
        with self._lock:
            self._subscribers.setdefault(key, []).append(callback)
