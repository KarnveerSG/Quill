# Recreate Claude Cowork with Quill

Architecture guide for building a **Claude Cowork–class** desktop agent: multi-step tasks, file access, tool use, and human-in-the-loop review — using Quill as the foundation.

---

## What Cowork is

Claude Cowork (Anthropic desktop) is an **agent workspace**, not a code editor:

1. User describes a goal in natural language
2. Agent plans, reads/writes files, runs commands, browses (via tools)
3. User sees **structured progress** (tool cards, diffs) and can approve/reject
4. Session persists across tasks with **workspace context**

Quill already has ~80% of the plumbing; this doc maps gaps to implementation.

---

## Core stack (already in Quill)

| Layer | Quill component | Cowork equivalent |
|-------|-----------------|-------------------|
| Shell | `desktop/` Electron app | Cowork desktop window |
| Agent runtime | `quill/` CLI + `ToolRunner` | Claude agent loop |
| PTY bridge | `node-pty` in `main.js` | Hidden terminal for tools |
| Chat UI | `agent-panel` + composer | Cowork chat column |
| File access | `read_file`, `write_file`, `edit_file` tools | Cowork file ops |
| MCP | `.quill/mcp.json` + hot reload | Cowork connectors |
| Personas | Iris, Sage, etc. per pane | Custom agent modes |
| Diffs | `[QUILL_EDIT:]` + inline diff bar | Cowork change review |

---

## Layout (Cursor/Cowork hybrid — shipped)

```
┌── activity ──┬── explorer/scm/search ──┬── editor + terminal ──┬── agent chat ──┐
│  ◫ ⑂ ⌕ ✦ ⚙  │  file tree / git        │  Monaco tabs center   │  tool cards    │
└──────────────┴─────────────────────────┴───────────────────────┴────────────────┘
```

Key files:

- `desktop/renderer/index.html` — 3-column shell
- `desktop/renderer/app.js` — workspaces, git, Monaco, agent stream
- `desktop/renderer/quill-features.js` — tabs, tool cards, search, onboarding

---

## Agent loop (recreate Cowork behavior)

### 1. Spawn agent with desktop flag

```javascript
// main.js pty-create sets:
env.QUILL_DESKTOP = "1"
```

This enables:

- `[QUILL_TOOL:name:detail]` on every tool call (`quill/tools.py`)
- `[QUILL_EDIT:path]` after file writes

### 2. Parse structured events in renderer

```javascript
// quill-features.js
/\[QUILL_TOOL:([^:]+):([^\]]*)\]/  → tool-card UI
/\[QUILL_EDIT:([^\]]+)\]/         → inline diff bar (Keep / Revert)
```

### 3. Human-in-the-loop

| Action | IPC | Effect |
|--------|-----|--------|
| Keep | dismiss bar | changes stay on disk |
| Revert | `git-revert-file` | `git checkout -- path` |

Extend for Cowork parity: stage-only writes until user clicks **Apply all**.

---

## Tool surface (match Cowork capabilities)

Minimum tool set (already in Quill):

- `read_file`, `write_file`, `edit_file`
- `bash` / shell
- `grep`, `glob`
- `codegraph_*` (Quill differentiator)
- `mcp_*` (GitHub, Slack, etc.)

**Add for full Cowork parity:**

1. **Browser tool** — Playwright MCP or `web_fetch`
2. **Spreadsheet/doc** — MCP servers (Google Drive, Notion)
3. **Task list UI** — parse agent plan markdown → checklist in agent panel
4. **Subagent delegation** — Quill personas as isolated PTY panes

---

## MCP as “Cowork connectors”

Config: `<workspace>/.quill/mcp.json`

```json
{
  "servers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "enabled": true }
  }
}
```

Desktop settings (`Settings → MCP`):

- Per-server **enable toggle** (phase 5)
- Test command, save, **Reload running agents** (`reload-mcp-agents` IPC)

Cowork pattern: user enables connectors once per workspace; agent picks tools at runtime.

---

## Multi-agent / personas (beat Cowork)

Quill advantage: **multiple PTY panes**, each with persona + mode.

Recreate Cowork “team” feel:

1. Activity bar → Agent → persona dropdown (Iris = general, Sage = review, etc.)
2. Optional: split agent panel into **Planner | Executor** panes
3. `state.panes[paneId].persona` persisted in `~/.quill/desktop-state.json`

---

## Workspace & context

Cowork scopes all tools to a folder. Quill equivalent:

- `activeWs().cwd` → PTY cwd + git root
- `@mentions` in composer → inject file paths into prompt
- `@` + symbols (phase 3) → `list-symbols` IPC
- CodeGraph MCP → semantic search beyond ripgrep

**Sync (phase 6):** `export-workspace-sync` / `import-workspace-sync` → `~/.quill/workspace-sync.json`

---

## UI checklist (Cowork parity)

- [x] Right-docked chat (not raw terminal for prompts)
- [x] Tool-call cards
- [x] Inline diff accept/reject
- [x] File tabs + Monaco editor
- [x] Global search (Ctrl+Shift+F)
- [x] SCM badges + gutter diff hints
- [x] First-run onboarding (open folder)
- [x] Auto-update banner (GitHub releases)
- [ ] Task plan sidebar (parse `## Plan` from agent)
- [ ] Apply-all / batch review for multi-file edits
- [ ] Sandboxed browser panel

---

## Build & ship

```powershell
# CLI (agent binary with QUILL_TOOL events)
python scripts/build_binary.py --install

# Desktop
cd desktop
npm install          # runs copy-vendor.mjs
npm run build:alt
# Install to %LOCALAPPDATA%\Programs\Quill Desktop\

# Verify
python scripts/verify_all.py
cd desktop && node test_desktop_e2e.mjs
```

---

## Minimal greenfield path (no Quill fork)

If rebuilding from scratch:

1. **Electron shell** — 3 columns, one `BrowserWindow`
2. **Preload bridge** — `contextBridge` for fs, git, pty, MCP config
3. **Spawn agent** — packaged Python or Node CLI in PTY
4. **Event protocol** — stderr markers `[TOOL]` / `[EDIT]` (same as Quill)
5. **Monaco** — vendored under `renderer/vendor/`
6. **MCP** — stdio servers in workspace `.quill/mcp.json`

Quill repo is the reference implementation for each step.

---

## Files to read first

| File | Purpose |
|------|---------|
| `desktop/main.js` | All IPC: git, pty, MCP, search |
| `desktop/preload.js` | Renderer API surface |
| `desktop/renderer/quill-features.js` | Cowork-like UX layers |
| `quill/tools.py` | Tool dispatch + desktop events |
| `docs/CURSOR_PARITY_PLAN.md` | Score tracker vs Cursor |

---

## Success criteria

Cowork recreation is **done** when:

1. User opens folder → chats → agent edits files → user sees tool cards + diff bar
2. MCP connectors toggle per workspace without restart
3. No CDN required (offline vendor bundle)
4. E2E smoke + `verify_all.py` green
5. Unique beat: personas + CodeGraph + local-first (no cloud lock-in)
