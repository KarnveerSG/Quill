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
QUILL_PROVIDER=auto
LM_STUDIO_URL=http://localhost:1234/v1
```

## Provider chain

`auto` (default): **Cursor** → **Claude API** → **local LLM**

Status bar provider dropdown switches `QUILL_PROVIDER` and persists to `~/.quill/.env`. On launch, Quill pings LM Studio (`:1234`) and Ollama (`:11434`) and shows **Local LLM: ready (model)** when available.

## Desktop IDE (v0.3)

### Workspaces & agents
- **Multi-workspace** — switch workspace without killing background agents; PTYs stay alive in main process
- **Running agents tray** (◎) — count badge + click-to-jump between active workspaces
- **Workspace dots** — green = agent running, red = idle/stopped
- **Task board** (☑ panel) — `.quill/tasks.json` per workspace; agents emit `[QUILL:TASK_START]` / `[QUILL:TASK_DONE]`

### Terminal grid
- Up to **9 panes** (3×3); 1 full, 2 split, 3–4 in 2×2
- **Per-pane status pill** — idle / thinking / editing / waiting / error from `[QUILL_TOOL:…]` markers
- **Handoff** — `/handoff <persona>` or agent composer **Send to pane** delegate
- Unique Greek goddess persona per pane (Hera, Artemis, Athena, Demeter, Aphrodite, Hestia, Persephone, Hecate, Nike)

### Agent panel
- Independent workspace selector; chat/composer without switching center view
- `@` file mentions in composer; structured stream to chat

### Command palette (`Ctrl+P`)
- `>` commands — settings, new pane, toggle provider, focus pane N, run last task
- `@` symbols & files
- `#` workspaces
- `:` go-to-line (e.g. `:42`)
- plain text — fuzzy file search

### Editor & SCM
- Monaco editor + inline diff hooks (`[QUILL_EDIT:path]`)
- Git status scoped to workspace folder (monorepo-safe)

### Settings
- Dark + **i mode** light theme
- MCP server config per workspace
- Keybinding overrides → `~/.quill/keybindings.json`

### Stability
- PTY shutdown race fixed; graceful quit kills all terminals and closes GPU/network connections

## Defaults (CLI)

- **Caveman ultra** — terse output
- **RTK** — compact shell output
- **CodeGraph** — when `.codegraph/` exists

## License

MIT
