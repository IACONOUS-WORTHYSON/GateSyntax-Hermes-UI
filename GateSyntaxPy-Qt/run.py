"""
Usage:
    python run.py myfile.ui
    python run.py path/to/myfile.ui

Works from any subdirectory — auto-locates the GateSyntaxPy-Qt root.
"""
import sys
from pathlib import Path

# Walk up from this file until we find gatesyntax_builder.py
_root = Path(__file__).resolve().parent
while _root != _root.parent:
    if (_root / "gatesyntax_builder.py").exists():
        break
    _root = _root.parent

sys.path.insert(0, str(_root))

from gatesyntax_builder import GateSyntaxBuilder

if len(sys.argv) < 2:
    print("Usage: python run.py <file.ui>")
    sys.exit(1)

GateSyntaxBuilder.from_file(sys.argv[1]).build().run()
