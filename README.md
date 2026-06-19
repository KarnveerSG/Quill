# SexyJarvis

Terminal AI coding agent. Token-optimized by default.

## Defaults (always on)

- **Caveman ultra** — terse output + terse extended-thinking fragments
- **RTK** — compact shell output (`execute_bash` auto-wraps when `rtk` installed)
- **CodeGraph** — `codegraph_*` tools when `.codegraph/` exists (`codegraph init` once per project)

## Provider chain

`auto` (default): **Cursor** (`auto` model) → **Claude API** → **local LLM** (LM Studio/Ollama)

Keys in `%USERPROFILE%\.sexyjarvis\.env` work from any folder:

```env
CURSOR_API_KEY=crsr_...
ANTHROPIC_API_KEY=sk-ant-...
SEXYJARVIS_CURSOR_MODEL=auto
LM_STUDIO_URL=http://localhost:1234/v1
```

## Install

```powershell
pip install -e ".[cursor]"
```

## Binary (Windows)

```powershell
pip install -e ".[build,cursor]"
python scripts/build_binary.py --install --with cursor
```

Then `sexyjarvis` from any terminal.

## Run

```powershell
sexyjarvis
sexyjarvis --yolo
sexyjarvis -w E:\path\to\project
```

## Config

Priority: CLI flags → env → workspace `.env` → `~/.sexyjarvis/.env` → `config.toml`

| Flag | Effect |
|------|--------|
| `--no-rtk` | Disable RTK wrapping |
| `--no-codegraph` | Disable CodeGraph tools |
| `--no-stream` | Disable streaming |
| `SEXYJARVIS_THINKING_BUDGET=0` | Disable extended thinking |

## License

MIT
