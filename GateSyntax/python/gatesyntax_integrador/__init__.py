"""
gatesyntax-integrador — Python package
Domain-agnostic live-binding layer for GateSyntaxPy / GateSyntaxPy-Qt.

Public API
----------
from gatesyntax_integrador import GateSyntaxIntegrador

ig = GateSyntaxIntegrador()

@ig.expose(min=0, max=200)
def speed() -> float:
    return _speed

@ig.expose_setter("speed")
def set_speed(v: float):
    global _speed; _speed = v

@ig.action(label="Reset")
def reset():
    global _speed; _speed = 0

ig.run()
"""

from .integrador import GateSyntaxIntegrador, _Binding

__all__ = ["GateSyntaxIntegrador"]
__version__ = "1.0.0"
