# Quill

IDE-style AI coding agent. Multi-workspace terminal desktop + CLI agent.

**Tagline:** CODE BEAUTIFUL

## Install (Windows)

```powershell
python scripts/install_quill.py
```

This installs:
- `quill` CLI on PATH (`%LOCALAPPDATA%\Programs\Quill\quill.exe`)
- **Quill** desktop IDE shortcut on your Desktop

## Run

```powershell
quill                  # terminal agent (any folder)
quill --desktop        # open desktop IDE
quill -w E:\project    # agent in workspace
quill --yolo           # skip confirmations
```

## Config

Priority: CLI flags → env → workspace `.env` → `~/.quill/.env` → `config.toml`

Legacy `~/.sexyjarvis/.env` is auto-migrated on install.

```env
CURSOR_API_KEY=crsr_...
ANTHROPIC_API_KEY=sk-ant-...
QUILL_CURSOR_MODEL=auto
LM_STUDIO_URL=http://localhost:1234/v1
```

## Provider chain

`auto` (default): **Cursor** → **Claude API** → **local LLM**

## Desktop IDE

- **Workspaces** — multiple isolated projects; red dot = agent running, green = idle
- **Explorer** — file tree with larger icons; `+` adds workspace; right-click to close/rename/open folder
- **Source control** — git status scoped to workspace folder (monorepo-safe); staged/changes sections
- **Terminal grid** — 1 pane full, 2 split, 3–4 in 2×2, 5–6 in 3×2; right-click pane header to split/duplicate/close
- **Agent panel** (right) — independent workspace selector; chat/composer target without switching center view
- Named AI personas per pane (Iris, Thea, Nova, Sage, Luna, Wren)
- Dark mode + **i mode** light theme; settings gear opens full settings overlay
- Agent panes run `quill` REPL; shell panes run PowerShell

## Defaults (CLI)

- **Caveman ultra** — terse output
- **RTK** — compact shell output
- **CodeGraph** — when `.codegraph/` exists

## License

MIT
