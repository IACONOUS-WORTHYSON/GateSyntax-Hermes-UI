"""
GateSyntaxPy-Qt — declarative GUI runtime powered by .ui files.
Same syntax as GateSyntax (WPF); targets PyQt5 / PyQt6.

Run:
    pip install PyQt5
    python main.py
"""
from pathlib import Path
from gatesyntax_builder import GateSyntaxBuilder


def main() -> None:
    ui_dir   = Path(__file__).parent / "UI"
    css_path = str(Path(__file__).parent / "resources" / "theme.qss")

    app = (
        GateSyntaxBuilder()
        .add_directory(str(ui_dir))
        .with_css(css_path)
        .build()
    )
    app.run()


if __name__ == "__main__":
    main()
