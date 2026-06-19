"""PyInstaller entry point for a standalone sexyjarvis executable."""

import importlib

# Rich loads unicode width tables lazily; PyInstaller misses the hyphenated modules.
for _mod in (
    "rich._unicode_data",
    "rich._unicode_data.unicode17-0-0",
    "rich._unicode_data.unicode16-0-0",
    "rich._unicode_data.unicode15-1-0",
):
    try:
        importlib.import_module(_mod)
    except ImportError:
        pass

from sexyjarvis.cursor_patch import apply as _apply_cursor_patch

_apply_cursor_patch()

from sexyjarvis.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
