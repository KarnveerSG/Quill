"""Load standing-instruction files (CLAUDE.md / SEXYJARVIS.md style).

The user wants a CLAUDE.md-like file whose contents are given to the model up
front. We search the workspace (and home dir) for a set of candidate names and
concatenate whatever we find.
"""

from __future__ import annotations

from pathlib import Path

# Searched in order; all matches found are concatenated.
CANDIDATE_NAMES = [
    "SEXYJARVIS.md",
    ".sexyjarvis.md",
    "CLAUDE.md",
    ".claude/CLAUDE.md",
    "AGENTS.md",
    ".cursorrules",
]

MAX_BYTES = 64_000  # don't let an enormous file blow up the context


def _read(path: Path) -> str | None:
    try:
        if path.is_file():
            text = path.read_text(encoding="utf-8", errors="replace")
            if len(text.encode("utf-8")) > MAX_BYTES:
                text = text[:MAX_BYTES] + "\n\n[...truncated...]"
            return text.strip()
    except Exception:
        return None
    return None


def load_instruction_files(workspace: Path, include_home: bool = True) -> list[tuple[Path, str]]:
    """Return list of (path, contents) for every instruction file found."""
    found: list[tuple[Path, str]] = []
    seen: set[Path] = set()

    search_roots = [workspace]
    if include_home:
        home = Path.home()
        if home != workspace:
            search_roots.append(home)

    for root in search_roots:
        for name in CANDIDATE_NAMES:
            p = (root / name).resolve()
            if p in seen:
                continue
            seen.add(p)
            content = _read(p)
            if content:
                found.append((p, content))
    return found


def build_memory_section(workspace: Path, include_home: bool = True) -> tuple[str, list[Path]]:
    """Build the system-prompt text block from instruction files.

    Returns (text_block, list_of_loaded_paths). Empty string if none found.
    """
    files = load_instruction_files(workspace, include_home=include_home)
    if not files:
        return "", []
    parts = [
        "The user has provided the following standing instructions. "
        "Treat them as high-priority guidance for this session:",
    ]
    loaded: list[Path] = []
    for path, content in files:
        parts.append(f"\n--- BEGIN {path.name} ({path}) ---\n{content}\n--- END {path.name} ---")
        loaded.append(path)
    return "\n".join(parts), loaded
