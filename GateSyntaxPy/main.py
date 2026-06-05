"""
GateSyntaxPy — declarative terminal UI runtime powered by .ui files.
Same syntax as GateSyntax (WPF); targets Textual (Rich-based TUI framework).

Run:
    pip install textual rich
    python main.py
"""
from pathlib import Path
from gatesyntax_builder import GateSyntaxBuilder


def main() -> None:
    ui_dir = Path(__file__).parent / "UI"
    css_path = str(Path(__file__).parent / "resources" / "theme.tcss")

    app = (
        GateSyntaxBuilder()
        .add_directory(str(ui_dir))
        .with_css(css_path)
        .build()
    )
    app.run()


if __name__ == "__main__":
    main()
